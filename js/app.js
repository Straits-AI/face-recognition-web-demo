import { sleep, l2normalize, cosine, avgVectors, clamp } from './utils.js';
import { listPeople, savePerson, deletePerson, getPerson } from './db.js';
import { initDetector, detectOnVideo, crop112 } from './detect.js';
import { loadORT } from './ort.js';
import { MODELS, embed } from './embedder.js';

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctxOv = overlay.getContext('2d');
const metrics = document.getElementById('metrics');
const cropCanvas = document.getElementById('crop');

const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnWarmup = document.getElementById('btnWarmup');
const btnCompare = document.getElementById('btnCompare');
const btnEnroll = document.getElementById('btnEnroll');
const btnVerify = document.getElementById('btnVerify');
const btnIdentify = document.getElementById('btnIdentify');

const chkWebGPU = document.getElementById('chkWebGPU');
const chkDetect = document.getElementById('chkDetect');
const selModel = document.getElementById('selModel');
const txtName = document.getElementById('txtName');
const numEnroll = document.getElementById('numEnroll');
const numVerify = document.getElementById('numVerify');
const numThr = document.getElementById('numThr');
const selPerson = document.getElementById('selPerson');
const peopleDiv = document.getElementById('people');

// New UI elements
const cameraStatus = document.getElementById('cameraStatus');
const systemStatus = document.getElementById('systemStatus');
const settingsToggle = document.getElementById('settingsToggle');
const settingsContent = document.getElementById('settingsContent');

// Upload elements
const btnCameraMode = document.getElementById('btnCameraMode');
const btnUploadMode = document.getElementById('btnUploadMode');
const cameraModeControls = document.getElementById('cameraModeControls');
const uploadModeControls = document.getElementById('uploadModeControls');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadPreview = document.getElementById('uploadPreview');
const previewImg = document.getElementById('previewImg');
const faceCount = document.getElementById('faceCount');
const btnEnrollUpload = document.getElementById('btnEnrollUpload');

let uploadedImageData = null;

let stream=null, rafId=null, detectorReady=false, ortInfo=null;

// UI Helper Functions
function updateSystemStatus(message) {
  if (systemStatus) {
    systemStatus.textContent = message;
  }
  console.log('System Status:', message);
}

function updateMetrics(message) {
  if (metrics) {
    metrics.innerHTML = `<div class="status-indicator">
      <span class="status-dot"></span>
      <span>${message}</span>
    </div>`;
  }
}

// Image upload and processing functions
async function detectFacesInImage(imageElement) {
  if (!landmarker) return null;
  
  try {
    const result = landmarker.detect(imageElement);
    if (!result || !result.faceLandmarks?.length) return null;
    
    const faces = [];
    for (let i = 0; i < result.faceLandmarks.length; i++) {
      const lm = result.faceLandmarks[i];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      // Calculate bounding box from landmarks
      for (const p of lm) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      
      // Add margin
      const width = maxX - minX;
      const height = maxY - minY;
      const margin = Math.max(width, height) * 0.1;
      
      minX = Math.max(0, minX - margin);
      minY = Math.max(0, minY - margin);
      maxX = Math.min(1, maxX + margin);
      maxY = Math.min(1, maxY + margin);
      
      faces.push({ bbox: [minX, minY, maxX, maxY], landmarks: lm });
    }
    
    return faces;
  } catch (error) {
    console.error('Face detection failed:', error);
    return null;
  }
}

function cropFaceFromImage(imageElement, bbox, targetSize = 112) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = targetSize;
  canvas.height = targetSize;
  
  const [minX, minY, maxX, maxY] = bbox;
  const imgWidth = imageElement.naturalWidth;
  const imgHeight = imageElement.naturalHeight;
  
  const x = minX * imgWidth;
  const y = minY * imgHeight;
  const width = (maxX - minX) * imgWidth;
  const height = (maxY - minY) * imgHeight;
  
  ctx.drawImage(imageElement, x, y, width, height, 0, 0, targetSize, targetSize);
  return canvas;
}

async function startCamera(){
  if(stream) return;
  
  btnStart.disabled = true;
  
  try {
    cameraStatus.textContent = 'Starting camera...';
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } , audio:false });
    video.srcObject = stream;
    await video.play();
    // Wait for video metadata to load
    await new Promise(resolve => {
      if (video.videoWidth > 0) resolve();
      else video.addEventListener('loadedmetadata', resolve, { once: true });
    });
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    btnStart.style.display = 'none';
    btnStop.style.display = 'inline-flex';
    cameraStatus.textContent = '📹 Camera Active';
    cameraStatus.style.background = 'rgba(72, 187, 120, 0.9)';
    updateSystemStatus('✅ Camera ready! Ready for face recognition.');
    loop();
  } catch (error) {
    console.error('Camera access failed:', error);
    let message = 'Camera access failed: ';
    if (error.name === 'NotFoundError') {
      message += 'No camera found';
    } else if (error.name === 'NotAllowedError') {
      message += 'Camera permission denied';
    } else {
      message += error.message;
    }
    cameraStatus.textContent = `❌ ${message}`;
    cameraStatus.style.background = 'rgba(245, 101, 101, 0.9)';
    updateSystemStatus(`❌ ${message}`);
    btnStart.disabled = false;
  }
}

function stopCamera(){
  if(stream){
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  video.srcObject = null;
  if(rafId){
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  ctxOv.clearRect(0, 0, overlay.width, overlay.height);
  btnStart.style.display = 'inline-flex';
  btnStop.style.display = 'none';
  cameraStatus.textContent = 'Camera stopped';
  cameraStatus.style.background = 'rgba(0, 0, 0, 0.7)';
  updateSystemStatus('Camera stopped. Click "Start Camera" to begin.');
}

async function loop(){
  const draw = chkDetect.checked;
  if(draw){
    const det = detectorReady ? detectOnVideo(video, performance.now()) : null;
    ctxOv.clearRect(0,0,overlay.width, overlay.height);
    if(det){
      const [minX,minY,maxX,maxY]=det.bbox;
      const x=minX*overlay.width, y=minY*overlay.height;
      const w=(maxX-minX)*overlay.width, h=(maxY-minY)*overlay.height;
      ctxOv.strokeStyle = '#6cf'; ctxOv.lineWidth = 2;
      ctxOv.strokeRect(x,y,w,h);
    }
  }else{
    ctxOv.clearRect(0,0,overlay.width, overlay.height);
  }
  rafId = requestAnimationFrame(loop);
}

async function refreshPeople(){
  const arr = await listPeople();
  selPerson.innerHTML = '';
  peopleDiv.innerHTML = '';
  
  // Group by model for better display
  const byModel = {};
  for(const p of arr) {
    const model = p.modelKey || 'unknown';
    if(!byModel[model]) byModel[model] = [];
    byModel[model].push(p);
  }
  
  for(const p of arr){
    const opt = document.createElement('option');
    opt.value=p.id; 
    opt.textContent=`${p.name} (${p.modelKey || 'unknown'})`;
    selPerson.appendChild(opt);

    const row = document.createElement('div');
    row.className='person-card';
    const modelBadge = p.modelKey ? 
      `<span class="model-badge">${p.modelKey}</span>` : 
      `<span class="model-badge unknown">unknown</span>`;
    row.innerHTML = `<span class="name">${p.name}</span>
      ${modelBadge}
      <span class="muted">dim=${p.emb.length}</span>
      <button data-id="${p.id}" class="btn btn-small" style="background: #f56565; color: white;">Delete</button>`;
    row.querySelector('button').onclick = async () => { await deletePerson(p.id); refreshPeople(); };
    peopleDiv.appendChild(row);
  }
}

async function warmup(){
  const key = selModel.value;
  btnWarmup.disabled = true;
  btnWarmup.textContent = 'Warming up...';
  
  try {
    // draw a dummy 112x112 gray square
    const ctx = cropCanvas.getContext('2d'); 
    cropCanvas.width=112; cropCanvas.height=112;
    ctx.fillStyle='#222'; ctx.fillRect(0,0,112,112);
    
    metrics.textContent = `Warming up ${key} model...`;
    
    const times = [];
    for(let i=0;i<5;i++){ 
      const { ms } = await embed(cropCanvas, key);
      times.push(ms);
      metrics.textContent = `Warmup ${i+1}/5 — ${ms.toFixed(1)} ms`;
    }
    
    const avg = times.reduce((a,b)=>a+b,0)/times.length;
    metrics.textContent = `✅ Warmup done for ${key}. Average: ${avg.toFixed(1)} ms`;
    
  } catch (error) {
    console.error('Warmup failed:', error);
    metrics.textContent = `❌ Warmup failed: ${error.message}`;
  } finally {
    btnWarmup.disabled = false;
    btnWarmup.textContent = 'Warmup';
  }
}

async function getAlignedCrop(){
  // Run detection quickly to get bbox; if detector off, use center crop
  let bbox = null;
  if(detectorReady){
    const det = detectOnVideo(video, performance.now());
    if(det) bbox = det.bbox;
  }
  if(!bbox){
    const vw=video.videoWidth, vh=video.videoHeight;
    const side = Math.min(vw,vh)*0.6;
    const sx=(vw-side)/2, sy=(vh-side)/2;
    const ctx=cropCanvas.getContext('2d');
    cropCanvas.width=112; cropCanvas.height=112;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, 112, 112);
    return cropCanvas;
  }
  return crop112(video, bbox, cropCanvas);
}

async function enroll(){
  const name = (txtName.value||'').trim();
  if(!name){ alert('Enter a name first'); return; }
  if(!stream){ alert('Start camera first'); return; }
  
  const N = clamp(parseInt(numEnroll.value||'20',10), 5, 200);
  const key = selModel.value;
  
  btnEnroll.disabled = true;
  btnEnroll.textContent = 'Enrolling...';
  
  try {
    const embs = [];
    metrics.textContent = 'Enrolling... capturing frames and generating embeddings...';
    
    for(let i=0;i<N;i++){
      const crop = await getAlignedCrop();
      const { emb, ms } = await embed(crop, key);
      embs.push(l2normalize(emb));
      metrics.textContent = `Frame ${i+1}/${N} — embed: ${ms.toFixed(1)} ms`;
      await sleep(30);
    }
    
    const centroid = avgVectors(embs);
    const id = `person:${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}:${Date.now()}`;
    await savePerson(id, name, centroid, key);
    
    updateMetrics(`✅ Successfully enrolled ${name} with ${N} frames (${centroid.length}D embedding)`);
    txtName.value = '';
    await refreshPeople();
    // Add success animation
    btnEnroll.style.background = 'linear-gradient(135deg, #48bb78, #38a169)';
    setTimeout(() => {
      btnEnroll.style.background = '';
    }, 1000);
    
  } catch (error) {
    console.error('Enrollment failed:', error);
    metrics.textContent = `❌ Enrollment failed: ${error.message}`;
  } finally {
    btnEnroll.disabled = false;
    btnEnroll.textContent = 'Enroll face';
  }
}

async function enrollFromUpload() {
  const name = (txtName.value||'').trim();
  if(!name){ alert('Enter a name first'); return; }
  if(!uploadedImageData){ alert('Please upload an image first'); return; }
  
  const key = selModel.value;
  btnEnrollUpload.disabled = true;
  btnEnrollUpload.textContent = 'Enrolling...';
  
  try {
    updateMetrics('Detecting faces in uploaded image...');
    
    // Create image element from uploaded data
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = uploadedImageData;
    });
    
    // Detect faces in the image
    const faces = await detectFacesInImage(img);
    if (!faces || faces.length === 0) {
      alert('No faces detected in the uploaded image. Please try a different photo.');
      return;
    }
    
    if (faces.length > 1) {
      // For now, use the first (largest) face
      faces.sort((a, b) => {
        const aArea = (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]);
        const bArea = (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]);
        return bArea - aArea;
      });
    }
    
    const selectedFace = faces[0];
    updateMetrics(`Found ${faces.length} face(s), using largest face for enrollment...`);
    
    // Crop the face from the image
    const faceCanvas = cropFaceFromImage(img, selectedFace.bbox);
    
    // Show the cropped face in preview
    cropCanvas.width = 112;
    cropCanvas.height = 112;
    const previewCtx = cropCanvas.getContext('2d');
    previewCtx.drawImage(faceCanvas, 0, 0);
    
    // Generate embedding
    updateMetrics('Generating face embedding...');
    const { emb, ms } = await embed(faceCanvas, key);
    const normalizedEmb = l2normalize(emb);
    
    // Save to database
    const id = `person:${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}:${Date.now()}`;
    await savePerson(id, name, normalizedEmb, key);
    
    updateMetrics(`✅ Successfully enrolled ${name} from uploaded photo (${emb.length}D embedding, ${ms.toFixed(1)}ms)`);
    txtName.value = '';
    await refreshPeople();
    
    // Success animation
    btnEnrollUpload.style.background = 'linear-gradient(135deg, #48bb78, #38a169)';
    setTimeout(() => {
      btnEnrollUpload.style.background = '';
    }, 1000);
    
  } catch (error) {
    console.error('Upload enrollment failed:', error);
    updateMetrics(`❌ Enrollment failed: ${error.message}`);
  } finally {
    btnEnrollUpload.disabled = false;
    btnEnrollUpload.textContent = 'Enroll from Photo';
  }
}

async function verify(){
  const pid = selPerson.value;
  if(!pid){ alert('No target selected'); return; }
  if(!stream){ alert('Start camera first'); return; }
  
  btnVerify.disabled = true;
  btnVerify.textContent = 'Verifying...';
  
  try {
    const person = await getPerson(pid);
    if(!person){ alert('Person not found'); return; }
    
    const thr = parseFloat(numThr.value||'0.6');
    const M = clamp(parseInt(numVerify.value||'8',10), 3, 60);
    const key = selModel.value;
    
    metrics.textContent = `Verifying against ${person.name}... capturing ${M} frames...`;
    
    const embs=[]; const times=[];
    for(let i=0;i<M;i++){
      const crop = await getAlignedCrop();
      const { emb, ms } = await embed(crop, key);
      embs.push(l2normalize(emb));
      times.push(ms);
      metrics.textContent = `Verifying... frame ${i+1}/${M} — embed: ${ms.toFixed(1)} ms`;
      await sleep(30);
    }
    
    const probe = avgVectors(embs);
    const score = cosine(probe, new Float32Array(person.emb));
    const avg = times.reduce((a,b)=>a+b,0)/times.length;
    const result = score >= thr ? '✅ MATCH' : '❌ NO MATCH';
    
    metrics.textContent = `Verification Results:
Model: ${key}
Frames: ${M}
Embed avg: ${avg.toFixed(1)} ms  P90: ${p90(times).toFixed(1)} ms
Score vs ${person.name}: ${score.toFixed(4)}  (threshold: ${thr})
Result: ${result}`;
    
  } catch (error) {
    console.error('Verification failed:', error);
    metrics.textContent = `❌ Verification failed: ${error.message}`;
  } finally {
    btnVerify.disabled = false;
    btnVerify.textContent = 'Verify';
  }
}

async function identifyFace(){
  if(!stream){ alert('Start camera first'); return; }
  
  const allPeople = await listPeople();
  if(allPeople.length === 0) {
    alert('No enrolled faces found. Please enroll someone first.');
    return;
  }
  
  btnIdentify.disabled = true;
  btnIdentify.textContent = 'Identifying...';
  
  try {
    const thr = parseFloat(numThr.value||'0.6');
    const M = clamp(parseInt(numVerify.value||'8',10), 3, 60);
    const key = selModel.value;
    
    // Filter people by current model
    const compatiblePeople = allPeople.filter(person => person.modelKey === key);
    const incompatibleCount = allPeople.length - compatiblePeople.length;
    
    if(compatiblePeople.length === 0) {
      alert(`No faces enrolled with ${key} model. Please enroll someone using this model first, or switch to a model that has enrolled faces.`);
      return;
    }
    
    updateMetrics(`Identifying face using ${key}... capturing ${M} frames...`);
    
    const embs=[]; const times=[];
    for(let i=0;i<M;i++){
      const crop = await getAlignedCrop();
      const { emb, ms } = await embed(crop, key);
      embs.push(l2normalize(emb));
      times.push(ms);
      updateMetrics(`Identifying... frame ${i+1}/${M} — embed: ${ms.toFixed(1)} ms`);
      await sleep(30);
    }
    
    const probe = avgVectors(embs);
    const avg = times.reduce((a,b)=>a+b,0)/times.length;
    
    // Compare against compatible faces only
    let bestMatch = null;
    let bestScore = -1;
    let allScores = [];
    
    for(const person of compatiblePeople) {
      const score = cosine(probe, new Float32Array(person.emb));
      allScores.push({ name: person.name, score, model: person.modelKey });
      if(score > bestScore) {
        bestScore = score;
        bestMatch = person;
      }
    }
    
    // Sort scores for display
    allScores.sort((a, b) => b.score - a.score);
    
    const isMatch = bestScore >= thr;
    const result = isMatch ? `✅ IDENTIFIED: ${bestMatch.name}` : '❌ UNKNOWN PERSON';
    
    let scoresText = allScores.slice(0, 5).map(s => 
      `  ${s.name}: ${s.score.toFixed(4)}${s.score >= thr ? ' ✅' : ''}`
    ).join('\n');
    
    let warningText = incompatibleCount > 0 ? 
      `\n⚠️  ${incompatibleCount} face(s) enrolled with different models (not compared)\n` : '';
    
    updateMetrics(`Face Identification Results:
Model: ${key}
Frames: ${M}
Compatible faces: ${compatiblePeople.length}/${allPeople.length}
Embed avg: ${avg.toFixed(1)} ms  P90: ${p90(times).toFixed(1)} ms
Threshold: ${thr}${warningText}

${result}

Top matches:
${scoresText}`);
    
  } catch (error) {
    console.error('Identification failed:', error);
    updateMetrics(`❌ Identification failed: ${error.message}`);
  } finally {
    btnIdentify.disabled = false;
    btnIdentify.textContent = 'Identify Face';
  }
}

function p90(arr){ const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(0.9*(s.length-1))]; }

async function compareAll(){
  const keys = Object.keys(MODELS);
  const results = [];
  for(const key of keys){
    // quick 6-frame probe per model
    const embs=[]; const times=[];
    for(let i=0;i<6;i++){
      const crop = await getAlignedCrop();
      const { emb, ms } = await embed(crop, key);
      embs.push(l2normalize(emb));
      times.push(ms);
      await sleep(20);
    }
    const probe = avgVectors(embs);
    results.push({ key, msAvg: times.reduce((a,b)=>a+b,0)/times.length, msP90: p90(times), dim: probe.length });
  }
  let out='Compare models on your device (embedding step only)\n';
  for(const r of results){
    out += `${r.key}: avg ${r.msAvg.toFixed(1)} ms (P90 ${r.msP90.toFixed(1)}), dim=${r.dim}\n`;
  }
  metrics.textContent = out;
}

function bindUI(){
  btnStart.onclick = startCamera;
  btnStop.onclick = stopCamera;
  btnWarmup.onclick = warmup;
  btnEnroll.onclick = enroll;
  btnEnrollUpload.onclick = enrollFromUpload;
  btnVerify.onclick = verify;
  btnIdentify.onclick = identifyFace;
  btnCompare.onclick = compareAll;
  chkDetect.onchange = ()=>{};
  
  // Mode switching
  btnCameraMode.onclick = () => switchToMode('camera');
  btnUploadMode.onclick = () => switchToMode('upload');
  
  // File upload handling
  uploadArea.onclick = () => fileInput.click();
  fileInput.onchange = handleFileSelect;
  
  // Drag and drop
  uploadArea.ondragover = (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  };
  uploadArea.ondragleave = () => {
    uploadArea.classList.remove('dragover');
  };
  uploadArea.ondrop = (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };
  
  // Settings toggle
  if (settingsToggle && settingsContent) {
    settingsToggle.onclick = () => {
      const isVisible = settingsContent.style.display !== 'none';
      settingsContent.style.display = isVisible ? 'none' : 'block';
      settingsToggle.textContent = isVisible ? '⚙️ Advanced Settings' : '⚙️ Hide Settings';
    };
  }
}

function switchToMode(mode) {
  if (mode === 'camera') {
    btnCameraMode.classList.add('active');
    btnUploadMode.classList.remove('active');
    cameraModeControls.style.display = 'flex';
    uploadModeControls.style.display = 'none';
  } else {
    btnUploadMode.classList.add('active');
    btnCameraMode.classList.remove('active');
    uploadModeControls.style.display = 'flex';
    cameraModeControls.style.display = 'none';
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    handleFile(file);
  }
}

async function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file (JPG, PNG, WebP)');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    uploadedImageData = e.target.result;
    previewImg.src = uploadedImageData;
    uploadPreview.style.display = 'block';
    faceCount.textContent = 'Analyzing faces...';
    
    try {
      // Create image for analysis
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = uploadedImageData;
      });
      
      // Detect faces
      const faces = await detectFacesInImage(img);
      if (!faces || faces.length === 0) {
        faceCount.textContent = '❌ No faces detected';
        faceCount.style.color = '#f56565';
        btnEnrollUpload.style.display = 'none';
      } else {
        faceCount.textContent = `✅ Found ${faces.length} face${faces.length > 1 ? 's' : ''} (will use largest)`;
        faceCount.style.color = '#48bb78';
        btnEnrollUpload.style.display = 'inline-flex';
      }
    } catch (error) {
      console.error('Face analysis failed:', error);
      faceCount.textContent = '❌ Analysis failed';
      faceCount.style.color = '#f56565';
      btnEnrollUpload.style.display = 'none';
    }
  };
  
  reader.readAsDataURL(file);
}

async function init(){
  try {
    bindUI();
    updateSystemStatus('Initializing system...');
    updateMetrics('🚀 Starting up AI face recognition system...');
    
    // Load ORT (WebGPU preferred?)
    updateSystemStatus('Loading ONNX Runtime...');
    updateMetrics('⚡ Loading ONNX Runtime for AI inference...');
    ortInfo = await loadORT(chkWebGPU.checked);
    updateSystemStatus(`ONNX Runtime loaded (${ortInfo.ep})`);
    
    // Init detector
    updateSystemStatus('Loading face detector...');
    updateMetrics('🎯 Loading MediaPipe face detection model...');
    await initDetector(); 
    detectorReady = true;
    
    // Load existing people
    await refreshPeople();
    
    updateSystemStatus('✅ System ready! Click "Start Camera" to begin.');
    updateMetrics('✅ AI face recognition system ready!\n\n1. Click "Start Camera" to enable video\n2. Use "Enroll New Person" to add faces\n3. Use "Identify Face" for recognition');
  } catch (error) {
    console.error('Initialization failed:', error);
    updateSystemStatus('❌ System initialization failed');
    updateMetrics(`❌ Initialization failed: ${error.message}`);
  }
}
init();
