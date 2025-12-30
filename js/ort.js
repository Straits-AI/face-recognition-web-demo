// ONNX Runtime Web wrapper — load via script tag approach
let ort = null;

export async function loadORT(webgpuPreferred = true) {
  if (ort) return { ort, ep: 'loaded' };

  return new Promise((resolve, reject) => {
    // Create script element to load ONNX Runtime
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.min.js';
    
    script.onload = () => {
      console.log('ONNX Runtime script loaded');
      // ONNX Runtime should be available globally as 'ort'
      if (window.ort) {
        ort = window.ort;
        console.log('Found ort on window:', ort);
        console.log('InferenceSession available:', !!ort.InferenceSession);
        
        // Configure WASM paths
        if (ort.env && ort.env.wasm) {
          ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/';
          try { 
            ort.env.wasm.simd = true; 
            ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4; 
          } catch(e){ 
            console.warn('WASM optimization failed:', e);
          }
        }
        
        resolve({ ort, ep: webgpuPreferred ? 'webgpu' : 'wasm' });
      } else {
        reject(new Error('ONNX Runtime not found on window object'));
      }
    };
    
    script.onerror = (error) => {
      console.error('Failed to load ONNX Runtime script:', error);
      reject(new Error('Failed to load ONNX Runtime script'));
    };
    
    document.head.appendChild(script);
  });
}

export function getORT() { 
  return ort ? { ort } : null; 
}
