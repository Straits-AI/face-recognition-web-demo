export function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
export function median(arr){const a=[...arr].sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2;}
export function l2norm(v){let s=0; for(const x of v) s+=x*x; return Math.sqrt(s)||1;}
export function l2normalize(v){const s=l2norm(v); return Float32Array.from(v, x=>x/s);}
export function cosine(a,b){let s=0; for(let i=0;i<a.length;i++) s+=a[i]*b[i]; return s;}
export function avgVectors(vecs){
  if(!vecs.length) return null;
  const out=new Float32Array(vecs[0].length);
  for(const v of vecs) for(let i=0;i<v.length;i++) out[i]+=v[i];
  for(let i=0;i<out.length;i++) out[i]/=vecs.length;
  return l2normalize(out);
}
export function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
