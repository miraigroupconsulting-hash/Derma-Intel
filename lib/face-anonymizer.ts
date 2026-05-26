/**
 * lib/face-anonymizer.ts
 *
 * Lazy-loaded MediaPipe face detector that returns eye-region
 * bounding boxes suitable for drawing black rectangles to anonymize
 * faces. Pure client-side: no model upload, no server roundtrip.
 *
 * Why MediaPipe over face-api.js:
 *   - ~150KB model vs ~190KB (TinyFaceDetector)
 *   - WASM + WebGL, 2-3x faster on mobile
 *   - Google maintains it; face-api.js stalled in 2022
 *   - Returns 6 keypoints including both eyes by default
 *
 * Usage:
 *   const result = await detectFacesForAnonymize(imageElement);
 *   if (result.faces.length === 0) {
 *     // No face found — warn médica, do NOT export silently
 *   }
 *   // result.eyeBoxes: Array of {x,y,w,h} rectangles to draw black over
 */

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

const WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

let detectorPromise: Promise<unknown> | null = null;

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FilesetResolver, FaceDetector } = await import(
        "@mediapipe/tasks-vision"
      );
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
      return await FaceDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
        },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.4,
      });
    })().catch((e) => {
      detectorPromise = null;
      throw e;
    });
  }
  return detectorPromise;
}

export interface AnonymizeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FaceAnonymizeResult {
  faces: number;
  /** Black rectangles to draw over eyes. Multiple per face if needed. */
  eyeBoxes: AnonymizeBox[];
}

/**
 * MediaPipe FaceDetector returns:
 *   - boundingBox: face bbox
 *   - keypoints: [rightEye, leftEye, noseTip, mouthCenter, rightEarTragion, leftEarTragion]
 *     each as normalized {x: 0..1, y: 0..1}
 *
 * We use the 2 eye keypoints to compute eye boxes proportional to
 * the face width (~14% of bbox width per eye, centered on keypoint).
 */
interface MediaPipeKeypoint {
  x: number;
  y: number;
}
interface MediaPipeDetection {
  boundingBox?: {
    originX: number;
    originY: number;
    width: number;
    height: number;
  };
  keypoints?: MediaPipeKeypoint[];
}
interface MediaPipeResult {
  detections: MediaPipeDetection[];
}

export async function detectFacesForAnonymize(
  image: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
): Promise<FaceAnonymizeResult> {
  const detector = (await getDetector()) as {
    detect: (img: typeof image) => MediaPipeResult;
  };
  const result = detector.detect(image);

  const eyeBoxes: AnonymizeBox[] = [];
  for (const det of result.detections ?? []) {
    const bbox = det.boundingBox;
    const kps = det.keypoints;
    if (!bbox || !kps || kps.length < 2) continue;

    const faceW = bbox.width;
    const faceH = bbox.height;
    // Generous box covering eyes + brows. Centered on each keypoint.
    const boxW = faceW * 0.35;
    const boxH = faceH * 0.13;

    // MediaPipe keypoints can come normalized OR in pixels depending
    // on the build. Check magnitude: if all values ≤ 1, treat as
    // normalized and scale to bbox; else treat as already pixel coords.
    const looksNormalized = kps.every((k) => k.x <= 1.5 && k.y <= 1.5);
    const getImgWidth = (img: typeof image) =>
      "width" in img ? img.width : 0;
    const getImgHeight = (img: typeof image) =>
      "height" in img ? img.height : 0;
    const imgW = getImgWidth(image);
    const imgH = getImgHeight(image);

    for (let i = 0; i < 2; i++) {
      const eye = kps[i];
      if (!eye) continue;
      const px = looksNormalized ? eye.x * imgW : eye.x;
      const py = looksNormalized ? eye.y * imgH : eye.y;
      eyeBoxes.push({
        x: Math.max(0, px - boxW / 2),
        y: Math.max(0, py - boxH / 2),
        w: boxW,
        h: boxH,
      });
    }
  }

  return { faces: result.detections?.length ?? 0, eyeBoxes };
}
