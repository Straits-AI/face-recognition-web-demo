// Cloudflare Worker for AI Face Recognition Demo
// Updated for 2024 Workers format with Assets support

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let pathname = url.pathname;

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Handle root path
    if (pathname === '/') {
      pathname = '/index.html';
    }

    try {
      // With the new assets config, Cloudflare handles static files automatically
      // We just need to add proper headers
      
      let response;
      
      // Try to get the asset - this will be handled by Cloudflare's asset serving
      if (env.ASSETS) {
        response = await env.ASSETS.fetch(request);
      } else {
        // Fallback for development
        response = new Response('Asset not found', { status: 404 });
      }

      // If asset found, modify headers
      if (response.status === 200) {
        const newResponse = new Response(response.body, response);

        // Add CORS headers for cross-origin requests
        newResponse.headers.set('Access-Control-Allow-Origin', '*');
        newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');

        // Add security headers
        newResponse.headers.set('X-Content-Type-Options', 'nosniff');
        newResponse.headers.set('X-Frame-Options', 'DENY');
        newResponse.headers.set('X-XSS-Protection', '1; mode=block');
        newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

        // Add specific headers for different file types
        if (pathname.endsWith('.wasm')) {
          newResponse.headers.set('Content-Type', 'application/wasm');
          newResponse.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
          newResponse.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        } else if (pathname.endsWith('.onnx')) {
          newResponse.headers.set('Content-Type', 'application/octet-stream');
        } else if (pathname.endsWith('.js')) {
          newResponse.headers.set('Content-Type', 'application/javascript');
        } else if (pathname.endsWith('.css')) {
          newResponse.headers.set('Content-Type', 'text/css');
        } else if (pathname.endsWith('.html')) {
          newResponse.headers.set('Content-Type', 'text/html; charset=utf-8');
        }

        // Add cache headers for static assets
        if (pathname.includes('/public/') || pathname.endsWith('.onnx')) {
          newResponse.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (pathname.endsWith('.js') || pathname.endsWith('.css')) {
          newResponse.headers.set('Cache-Control', 'public, max-age=86400');
        }

        return newResponse;
      }

      // If asset not found, return 404 with CORS headers
      return new Response('File not found', { 
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain',
        }
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response('Internal Server Error', { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain',
        }
      });
    }
  },
};