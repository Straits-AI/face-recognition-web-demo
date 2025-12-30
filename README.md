# 🎯 AI Face Recognition Demo

A modern, browser-based face recognition system powered by cutting-edge AI technologies. Experience real-time face detection and recognition directly in your browser with WebGPU acceleration.

![AI Face Recognition Demo](https://img.shields.io/badge/AI-Face_Recognition-blue?style=for-the-badge) ![WebGPU](https://img.shields.io/badge/WebGPU-Accelerated-green?style=for-the-badge) ![No Backend](https://img.shields.io/badge/No_Backend-Client_Only-orange?style=for-the-badge)

## ✨ Features

### 🚀 **Advanced AI Technologies**
- **MediaPipe Face Landmarker**: Real-time face detection and landmark extraction
- **ONNX Runtime Web**: Neural network inference with WebGPU/WASM acceleration
- **3 Neural Network Models**: Choose between speed and accuracy
- **Cross-Model Compatibility**: Proper isolation prevents embedding conflicts

### 📸 **Flexible Enrollment Options**
- **📹 Live Camera**: Real-time enrollment from webcam
- **📁 Photo Upload**: Enroll from existing images with drag-and-drop
- **Multi-Face Detection**: Automatically handles photos with multiple people
- **Smart Cropping**: Intelligent face extraction and preprocessing

### 🔍 **Powerful Recognition Modes**
- **Face Identification (1:N)**: Identify who this person is from database
- **Face Verification (1:1)**: Verify if this is a specific person
- **Real-time Performance**: Sub-100ms inference times
- **Confidence Scoring**: Detailed similarity scores and thresholds

### 🛡️ **Privacy-First Design**
- **No Server Required**: Runs entirely in your browser
- **Local Storage Only**: Face embeddings stored in IndexedDB
- **No Images Saved**: Only mathematical representations stored
- **GDPR Compliant**: Complete user data control

## 🧠 Face Recognition Models

| Model | Size | Speed | Accuracy | Best For |
|-------|------|-------|----------|----------|
| **MobileFaceNet** | 3.8MB | ⚡ Fast | 🎯 Good | Mobile/Real-time |
| **ShuffleMixFaceNet-S** | 12MB | ⚡ Fast | 🎯🎯 Better | Balanced use |
| **AdaFace R50** | 174MB | 🐌 Slow | 🎯🎯🎯 Best | High accuracy needs |

> ⚠️ **Model Files Required**: You must provide your own ONNX models under `public/models/`:
> - `mobilefacenet.onnx` — 112×112, RGB, normalized to [-1,1]
> - `shufflemixfacenet_s.onnx` — 112×112, RGB, normalized to [-1,1]
> - `adaface_r50.onnx` — 112×112, **BGR**, normalized to [-1,1]

## 🚀 Quick Start

### Option 1: Local Development
```bash
# Clone the repository
git clone https://github.com/your-username/ai-face-recognition-demo.git
cd ai-face-recognition-demo

# Start local server (HTTPS recommended for WebGPU)
python3 -m http.server 8080

# Open in browser
open http://localhost:8080
```

### Option 2: Cloudflare Workers Deployment

#### Prerequisites
- Node.js 16+ installed
- Cloudflare account
- Wrangler CLI: `npm install -g wrangler`

#### Model File Considerations
⚠️ **Large Model Limitation**: The AdaFace R50 model (166MB) exceeds Cloudflare Workers' 25MB asset limit. For production deployment:

**Option A - Exclude Large Model:**
```bash
# Temporarily move large model file out of project
mv public/models/adaface_r50.onnx ~/adaface_r50.onnx.backup

# Deploy with MobileFaceNet and ShuffleMixFaceNet only
npm run deploy

# Restore model file for local development
mv ~/adaface_r50.onnx.backup public/models/adaface_r50.onnx
```

**Option B - External Hosting:**
1. Host `adaface_r50.onnx` on external CDN (AWS S3, GitHub LFS, etc.)
2. Update model path in `js/embedder.js`
3. Deploy normally

#### Deploy to Cloudflare Workers
```bash
# Install dependencies
npm install

# Login to Cloudflare (one-time setup)
wrangler login

# Deploy to production (excludes AdaFace model)
npm run deploy
```

Your app will be available at: `https://ai-face-recognition-demo.your-subdomain.workers.dev`

#### Development Commands
```bash
# Local development with Wrangler
npm run dev

# Deploy to production (with chunked AdaFace model)
npm run deploy-chunked

# Manual chunked deployment
npm run chunk-model           # Split AdaFace into chunks
npm run deploy-chunked        # Deploy with chunks

# Preview before deployment
npm run preview
```

#### Deployment Notes
- ✅ **MobileFaceNet** (3.8MB) - Included
- ✅ **ShuffleMixFaceNet-S** (12MB) - Included  
- ✅ **AdaFace R50** (166MB) - **Now supported via chunking!**
  - Split into 9 chunks of ~20MB each
  - Client-side reconstruction with progress tracking
  - Automatic fallback to direct loading if chunks unavailable

## 📖 How to Use

### 1. **System Initialization**
- Application loads AI models automatically
- MediaPipe and ONNX Runtime initialize
- Status shows "✅ Ready! Start camera to begin"

### 2. **Camera Setup**
- Click "📹 Start Camera" button
- Grant camera permissions when prompted
- Blue face detection overlay appears around detected faces

### 3. **Enroll People**

**📹 Camera Mode:**
- Enter person's name in the input field
- Position face clearly in the detection box
- Click "➕ Enroll Face" (captures 20 frames automatically)
- System generates and stores face embedding

**📁 Upload Mode:**
- Switch to "Upload Photo" tab
- Drag & drop image or click to select
- System analyzes: "✅ Found 1 face (will use largest)"
- Enter name and click "➕ Enroll from Photo"

### 4. **Face Recognition**

**🎯 Automatic Identification:**
- Point camera at person's face
- Click "🎯 Identify Face"
- System compares against all enrolled faces
- Shows: "✅ IDENTIFIED: Alice" or "❌ UNKNOWN PERSON"

**✓ Targeted Verification:**
- Select specific person from dropdown
- Click "✓ Verify Selected"
- Shows match confidence score

## ⚙️ Configuration

### Model Selection
Choose based on your needs:
- **MobileFaceNet**: Best for real-time, mobile devices
- **ShuffleMixFaceNet-S**: Balanced speed and accuracy
- **AdaFace R50**: Maximum accuracy for high-stakes applications

### Recognition Parameters
- **Frames**: Number of frames to capture (3-50)
  - More frames = better accuracy, slower processing
- **Threshold**: Similarity threshold for matches (0-1)
  - Higher = stricter matching, fewer false positives
- **Detection**: Toggle face detection overlay on/off

## 🛠️ Technical Architecture

### Core Technologies
- **Vanilla JavaScript**: No frameworks for maximum performance
- **MediaPipe Tasks Vision**: Google's face detection library
- **ONNX Runtime Web**: Microsoft's inference engine
- **WebGPU API**: GPU acceleration in browsers
- **IndexedDB**: Browser-native persistent storage

### Processing Pipeline
1. **Face Detection**: MediaPipe locates face in image/video
2. **Face Alignment**: Crops and normalizes face to 112×112
3. **Feature Extraction**: ONNX model generates embedding vector
4. **Normalization**: L2-normalize embeddings for comparison
5. **Similarity Matching**: Cosine similarity against database

### Performance Optimizations
- **Model Caching**: Models loaded once and reused
- **WebGPU Acceleration**: 2-3x faster than WASM
- **Embedding Averaging**: Multiple frames improve stability
- **Lazy Loading**: Resources loaded only when needed

## 📊 Performance Benchmarks

*Tested on M1 MacBook Pro, Chrome 120+*

| Model | Load Time | Warmup | Inference | Memory Usage |
|-------|-----------|--------|-----------|--------------|
| MobileFaceNet | ~500ms | ~100ms | ~25ms | ~50MB |
| ShuffleMixFaceNet-S | ~800ms | ~150ms | ~35ms | ~80MB |
| AdaFace R50 | ~2000ms | ~400ms | ~120ms | ~200MB |

### Browser Compatibility
- ✅ **Chrome 113+**: Full WebGPU support
- ✅ **Firefox 110+**: WASM fallback
- ✅ **Safari 16+**: WASM fallback
- ✅ **Edge 113+**: Full WebGPU support

## 🔒 Security & Privacy

### Privacy Features
- **No Server Communication**: All processing happens locally
- **No Image Storage**: Only mathematical embeddings saved
- **User Control**: Easy database clearing and management
- **No Tracking**: No analytics or third-party scripts

### Security Measures
- **HTTPS Required**: Secure camera access
- **Content Security Policy**: XSS and injection protection
- **CORS Headers**: Proper cross-origin handling
- **Input Validation**: File type and size restrictions

## 📁 Project Structure

```
├── index.html              # Main application interface
├── styles.css              # Modern CSS styling
├── worker.js               # Cloudflare Worker (deployment)
├── wrangler.toml          # Deployment configuration
├── package.json           # NPM dependencies and scripts
├── js/
│   ├── app.js              # Main application logic
│   ├── detect.js           # MediaPipe face detection
│   ├── embedder.js         # ONNX model inference
│   ├── ort.js              # ONNX Runtime loader
│   ├── db.js               # IndexedDB storage
│   └── utils.js            # Utility functions
└── public/models/          # ONNX face recognition models
    ├── mobilefacenet.onnx
    ├── shufflemixfacenet_s.onnx
    └── adaface_r50.onnx
```

## 🛡️ Browser Requirements

### Minimum Requirements
- Modern browser (Chrome 90+, Firefox 88+, Safari 14+)
- Camera access permissions
- JavaScript enabled
- IndexedDB support

### Optimal Experience
- Chrome 113+ or Edge 113+ (WebGPU support)
- High-resolution webcam
- Good lighting conditions
- Stable internet connection (for model loading)

## 🚨 Important Notes

### Face Recognition Accuracy
- **Lighting**: Good, even lighting improves accuracy
- **Angle**: Face should be relatively frontal
- **Distance**: 1-3 feet from camera optimal
- **Multiple Frames**: More frames = better stability

### Model Compatibility
- **Cross-Model**: Don't mix models for same person
- **Version Control**: Keep model versions consistent
- **Backup**: Export/import embeddings for data migration

### Deployment Considerations
- **Model Size**: Large models (AdaFace) increase load times
- **CDN**: Use Cloudflare Workers for global distribution
- **Caching**: Proper cache headers for model files

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** changes: `git commit -m 'Add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Development Guidelines
- Follow existing code style
- Add JSDoc comments
- Test across browsers
- Update documentation

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

- **Issues**: [GitHub Issues](https://github.com/your-username/ai-face-recognition-demo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/ai-face-recognition-demo/discussions)

## 🌟 Acknowledgments

- **Google MediaPipe**: Face detection technology
- **Microsoft ONNX**: Cross-platform ML inference
- **Cloudflare Workers**: Serverless edge platform
- **Open Source Community**: Face recognition models

---

**⭐ Star this repository if you found it helpful!**
