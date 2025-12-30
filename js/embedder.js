import { getORT } from './ort.js';
import { chunkLoader } from './chunk-loader.js';

// Model registry — put your .onnx files under /public/models/
export const MODELS = {
  'mobilefacenet': {
    url: './public/models/mobilefacenet.onnx',
    size: 112, color: 'RGB', norm: 'minus1to1'
  },
  'shufflemix_s': {
    url: './public/models/shufflemixfacenet_s.onnx',
    size: 112, color: 'RGB', norm: 'minus1to1'
  },
  'adaface_r50': {
    url: './public/models/adaface_r50.onnx',
    chunkedUrl: './public/models/adaface_chunks',
    size: 112, color: 'BGR', norm: 'minus1to1',
    useChunks: true  // Enable chunked loading
  }
};

let sessions = {};
export async function loadModel(key, onProgress = null){
  const cfg = MODELS[key];
  if(!cfg) throw new Error('Unknown model key: '+key);
  if(sessions[key]) return sessions[key];
  const ortLib = getORT();
  if(!ortLib) throw new Error('ONNX Runtime not loaded. Call loadORT() first.');
  const { ort } = ortLib;
  
  console.log('ORT object:', ort);
  console.log('InferenceSession available:', ort.InferenceSession);
  
  if(!ort.InferenceSession) {
    throw new Error('ONNX InferenceSession not available. Check ONNX Runtime loading.');
  }
  
  // Try WebGPU first, fallback to WASM
  let executionProviders = ['webgpu', 'wasm'];
  
  try {
    let modelData;
    
    // Check if we should use chunked loading
    if (cfg.useChunks && cfg.chunkedUrl) {
      console.log(`Attempting chunked loading for ${key}`);
      
      // Check if chunks are available
      const chunksAvailable = await chunkLoader.isChunkedModelAvailable(cfg.chunkedUrl);
      
      if (chunksAvailable) {
        console.log(`Loading ${key} from chunks...`);
        modelData = await chunkLoader.loadChunkedModel(cfg.chunkedUrl, onProgress);
        console.log(`Chunked loading complete for ${key}`);
      } else {
        console.log(`Chunks not available for ${key}, falling back to direct URL`);
        modelData = cfg.url;
      }
    } else {
      modelData = cfg.url;
    }
    
    const session = await ort.InferenceSession.create(modelData, { executionProviders });
    sessions[key] = session;
    console.log(`Model ${key} loaded successfully`);
    return session;
    
  } catch (error) {
    console.warn('WebGPU failed, trying WASM only:', error);
    
    // Retry with WASM and same loading logic
    try {
      let modelData;
      
      if (cfg.useChunks && cfg.chunkedUrl) {
        const chunksAvailable = await chunkLoader.isChunkedModelAvailable(cfg.chunkedUrl);
        if (chunksAvailable) {
          modelData = await chunkLoader.loadChunkedModel(cfg.chunkedUrl, onProgress);
        } else {
          modelData = cfg.url;
        }
      } else {
        modelData = cfg.url;
      }
      
      const session = await ort.InferenceSession.create(modelData, { 
        executionProviders: ['wasm'] 
      });
      sessions[key] = session;
      console.log(`Model ${key} loaded with WASM fallback`);
      return session;
      
    } catch (wasmError) {
      console.error('Both WebGPU and WASM failed:', wasmError);
      throw wasmError;
    }
  }
}

// Convert 112x112 canvas image to CHW float32 tensor according to model config
export function canvasToCHW(canvas, modelKey){
  const { color, norm, size } = MODELS[modelKey];
  const ctx = canvas.getContext('2d', { willReadFrequently:true });
  const { data } = ctx.getImageData(0,0,size,size);
  const chw = new Float32Array(3*size*size);
  // mean/std style: here use [-1,1] normalization: (val/127.5 - 1)
  const toFloat = (v)=> v/127.5 - 1.0;
  for(let i=0, p=0; i<data.length; i+=4, p++){
    const r=data[i], g=data[i+1], b=data[i+2];
    let c0, c1, c2;
    if(color==='BGR'){ c0=b; c1=g; c2=r; } else { c0=r; c1=g; c2=b; }
    chw[p] = toFloat(c0);
    chw[size*size + p] = toFloat(c1);
    chw[2*size*size + p] = toFloat(c2);
  }
  return chw;
}

export async function embed(canvas, modelKey){
  const session = await loadModel(modelKey);
  const ortLib = getORT();
  if(!ortLib) throw new Error('ONNX Runtime not loaded. Call loadORT() first.');
  const { ort } = ortLib;
  const inputName = session.inputNames[0];
  const outName = session.outputNames[0];
  const size = MODELS[modelKey].size;
  const chw = canvasToCHW(canvas, modelKey);
  const tensor = new ort.Tensor('float32', chw, [1,3,size,size]);
  const t0 = performance.now();
  const outputMap = await session.run({ [inputName]: tensor });
  const ms = performance.now() - t0;
  const out = outputMap[outName];
  return { emb: out.data, ms };
}
