/**
 * js/face.js
 * ------------------
 * Wraps face-api.js (running entirely client-side, in the browser, on the
 * webcam feed) to:
 *   1. load the tiny-face-detector + landmark + recognition models
 *   2. start/stop a webcam stream on a <video> element
 *   3. capture one or several 128-d face descriptors, drawing a live
 *      bounding box onto the aperture's <canvas> overlay while it works
 *
 * No image frames ever leave the browser — only the numeric descriptor
 * array is sent to the server.
 */

const FaceEngine = (() => {
  let modelsLoaded = false;

  async function loadModels() {
    if (modelsLoaded) return;
    const MODEL_URL = "models";
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  }

  async function startVideo(videoEl) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 480, height: 480, facingMode: "user" },
      audio: false,
    });
    videoEl.srcObject = stream;
    await new Promise((resolve) => {
      videoEl.onloadedmetadata = () => resolve();
    });
    return stream;
  }

  function stopVideo(videoEl) {
    const stream = videoEl.srcObject;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    videoEl.srcObject = null;
  }

  function drawBox(canvasEl, videoEl, detection, color) {
    const ctx = canvasEl.getContext("2d");
    canvasEl.width = videoEl.videoWidth || 480;
    canvasEl.height = videoEl.videoHeight || 480;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    if (!detection) return;
    const { x, y, width, height } = detection.detection.box;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);
  }

  function clearCanvas(canvasEl) {
    const ctx = canvasEl.getContext("2d");
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  }

  const TINY_OPTS = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

  /**
   * Runs detection continuously until `numSamples` good single-face reads
   * are collected, then resolves with the averaged 128-d descriptor.
   * Returns a controller: { promise, cancel() }
   */
  function captureDescriptorSamples(videoEl, canvasEl, { numSamples = 6, onProgress } = {}) {
    let cancelled = false;
    let rafId = null;
    const samples = [];

    const promise = new Promise((resolve) => {
      async function tick() {
        if (cancelled) return resolve(null);

        const detection = await faceapi
          .detectSingleFace(videoEl, TINY_OPTS)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          drawBox(canvasEl, videoEl, detection, "#4f9d69");
          samples.push(detection.descriptor);
          if (onProgress) onProgress(samples.length, numSamples);
        } else {
          drawBox(canvasEl, videoEl, null, "#a8432b");
        }

        if (samples.length >= numSamples) {
          clearCanvas(canvasEl);
          const avg = new Float32Array(128);
          for (const s of samples) {
            for (let i = 0; i < 128; i++) avg[i] += s[i] / samples.length;
          }
          resolve(Array.from(avg));
          return;
        }

        rafId = requestAnimationFrame(tick);
      }
      tick();
    });

    return {
      promise,
      cancel() {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        clearCanvas(canvasEl);
      },
    };
  }

  /**
   * Runs detection continuously until one good single-face read is found
   * (or `timeoutMs` elapses), then resolves with that one descriptor
   * (or null on timeout/cancel).
   */
  function captureSingleDescriptor(videoEl, canvasEl, { timeoutMs = 15000 } = {}) {
    let cancelled = false;
    let rafId = null;
    const start = performance.now();

    const promise = new Promise((resolve) => {
      async function tick() {
        if (cancelled) return resolve(null);
        if (performance.now() - start > timeoutMs) {
          clearCanvas(canvasEl);
          return resolve(null);
        }

        const detection = await faceapi
          .detectSingleFace(videoEl, TINY_OPTS)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          drawBox(canvasEl, videoEl, detection, "#c6a15b");
          clearCanvas(canvasEl);
          return resolve(Array.from(detection.descriptor));
        } else {
          drawBox(canvasEl, videoEl, null, "#a8432b");
        }

        rafId = requestAnimationFrame(tick);
      }
      tick();
    });

    return {
      promise,
      cancel() {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        clearCanvas(canvasEl);
      },
    };
  }

  return {
    loadModels,
    startVideo,
    stopVideo,
    captureDescriptorSamples,
    captureSingleDescriptor,
    clearCanvas,
  };
})();
