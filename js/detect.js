// MediaPipe Tasks — Face Landmarker wrapper for detection + basic crop
// We'll use bounding box (no rotation) for simplicity. You can upgrade to 5-pt alignment later.

const MP_URL='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest';
let FaceLandmarker, FilesetResolver;
let landmarker=null;

export async function initDetector(){
  if(!FaceLandmarker){
    ({FaceLandmarker, FilesetResolver} = await import(MP_URL));
  }
  const resolver = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );
  landmarker = await FaceLandmarker.createFromOptions(resolver, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.5
  });
  return landmarker;
}

export function haveDetector(){ return !!landmarker; }

export function detectOnVideo(video, timestamp){
  if(!landmarker) return null;
  const res = landmarker.detectForVideo(video, timestamp);
  if(!res || !res.faceLandmarks?.length || !res.faceLandmarks[0]) return null;
  
  // Try to use face detection results first
  if(res.faceBlendshapes && res.faceBlendshapes[0] && res.faceBlendshapes[0].categories) {
    // If we have detection results, use those bounds
  }
  
  // Compute bounding box from landmarks with better algorithm
  const lm = res.faceLandmarks[0];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  // Use key facial landmarks for better bounding box
  // Focus on outline landmarks: 10, 151, 234, 454 (forehead, chin, left, right)
  const keyPoints = [10, 151, 234, 454, 0, 4, 5, 6, 8, 9, 10, 151, 152, 175, 234, 454];
  const pointsToUse = keyPoints.length > 0 ? keyPoints.map(i => lm[i]).filter(p => p) : lm;
  
  for(const p of pointsToUse){
    if(p.x < minX) minX = p.x;
    if(p.x > maxX) maxX = p.x;
    if(p.y < minY) minY = p.y;
    if(p.y > maxY) maxY = p.y;
  }
  
  // Add some margin to ensure we capture the full face
  const width = maxX - minX;
  const height = maxY - minY;
  const margin = Math.max(width, height) * 0.1;
  
  minX = Math.max(0, minX - margin);
  minY = Math.max(0, minY - margin);
  maxX = Math.min(1, maxX + margin);
  maxY = Math.min(1, maxY + margin);
  
  return {bbox:[minX,minY,maxX,maxY], lm};
}

// Crop to 112x112 using bbox with a little margin
export function crop112(video, bbox, canvas){
  const [minX,minY,maxX,maxY]=bbox;
  const vw=video.videoWidth, vh=video.videoHeight;
  const cx = ((minX+maxX)/2)*vw, cy=((minY+maxY)/2)*vh;
  const size = Math.max((maxX-minX)*vw, (maxY-minY)*vh);
  const margin = size*0.4; // add padding
  const side = Math.min(Math.max(size+margin, 120), Math.min(vw,vh));
  const sx = Math.max(0, cx - side/2), sy = Math.max(0, cy - side/2);
  const ssw = Math.min(side, vw - sx), ssh = Math.min(side, vh - sy);
  const ctx = canvas.getContext('2d');
  canvas.width=112; canvas.height=112;
  ctx.clearRect(0,0,112,112);
  ctx.drawImage(video, sx, sy, ssw, ssh, 0, 0, 112, 112);
  return canvas;
}
