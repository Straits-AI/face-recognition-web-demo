Place your ONNX models here:

- mobilefacenet.onnx
- shufflemixfacenet_s.onnx
- adaface_r50.onnx

All models should take [1,3,112,112] float32 input. 
Preprocessing in js/embedder.js assumes [-1,1] normalization and RGB (or BGR for AdaFace).
