/**
 * PairPair Adaptive Quality Test - Browser Console Helper
 * 
 * このスクリプトをゲスト側の DevTools コンソール (F12) にコピペして実行してください
 * 各テストシーンで自動的にメトリクスを記録します
 */

console.log("%c[TestHelper] PairPair Quality Metrics Recorder Started", "color: cyan; font-weight: bold");

// Metrics collection state
const testMetrics = {
  startTime: Date.now(),
  scene: null,
  frames: [],
  sharpnessScores: [],
};

/**
 * Start recording for a specific test scene
 * @param {string} sceneName - Scene identifier (idle, mouse_moving, scrolling, typing, clicking)
 * @param {number} durationSec - Test duration in seconds
 */
window.startTestScene = function(sceneName, durationSec = 10) {
  console.log(`%c[Test] Starting scene: ${sceneName} (${durationSec}s)`, "color: green; font-weight: bold");
  testMetrics.scene = sceneName;
  testMetrics.frames = [];
  testMetrics.sharpnessScores = [];
  testMetrics.startTime = Date.now();
  
  // Estimate scene parameters based on name
  const expected = {
    idle: { fps: 1, quality: 30, mbps: 0.8 },
    mouse_moving: { fps: 15, quality: 60, mbps: 7.8 },
    scrolling: { fps: 20, quality: 70, mbps: 10.9 },
    typing: { fps: 5, quality: 50, mbps: 3.2 },
    clicking: { fps: 30, quality: 80, mbps: 15.6 },
  };
  
  const exp = expected[sceneName] || { fps: "?", quality: "?", mbps: "?" };
  console.log(`%cExpected: ${exp.fps} fps, ${exp.quality}% quality, ${exp.mbps} Mbps`, "color: gray");
};

/**
 * Log a quality metric (call this periodically)
 */
window.logMetric = function(framesDecoded, framesDropped, bitrateMbps, width, height) {
  const metric = {
    timestamp: new Date().toISOString(),
    framesDecoded,
    framesDropped,
    bitrateMbps,
    width,
    height,
  };
  testMetrics.frames.push(metric);
  
  console.log(
    `%c[QualityMetrics] ${metric.timestamp} | FD:${framesDecoded} DR:${framesDropped} BR:${bitrateMbps.toFixed(2)}Mbps W:${width}x${height}`,
    "color: #4a9eff"
  );
};

/**
 * Log frame sharpness score
 */
window.logSharpness = function(score) {
  const metric = {
    timestamp: new Date().toISOString(),
    score,
  };
  testMetrics.sharpnessScores.push(metric);
  
  console.log(
    `%c[SharpnessAnalysis] ${metric.timestamp} | Sharpness: ${score.toFixed(1)}/100`,
    "color: #ffa500"
  );
};

/**
 * End scene and generate summary
 */
window.endTestScene = function() {
  if (!testMetrics.scene) {
    console.warn("No scene in progress");
    return;
  }
  
  const scene = testMetrics.scene;
  const elapsed = (Date.now() - testMetrics.startTime) / 1000;
  
  console.log(`%c[Test] Completed scene: ${scene} (${elapsed.toFixed(1)}s elapsed)`, "color: blue");
  
  // Calculate averages
  if (testMetrics.frames.length > 0) {
    const avgBitrate = testMetrics.frames.reduce((a, b) => a + b.bitrateMbps, 0) / testMetrics.frames.length;
    const totalFrames = testMetrics.frames[testMetrics.frames.length - 1].framesDecoded - testMetrics.frames[0].framesDecoded;
    const totalDrops = testMetrics.frames.reduce((a, b) => a + b.framesDropped, 0);
    
    console.log(`%cSummary:
  Avg Bitrate: ${avgBitrate.toFixed(2)} Mbps
  Frames: ${totalFrames} decoded, ${totalDrops} dropped
  Drop Rate: ${((totalDrops / totalFrames) * 100).toFixed(2)}%`, "color: green; background: #1a1a2e; padding: 8px");
  }
  
  if (testMetrics.sharpnessScores.length > 0) {
    const avgSharpness = testMetrics.sharpnessScores.reduce((a, b) => a + b.score, 0) / testMetrics.sharpnessScores.length;
    console.log(`%cAvg Sharpness: ${avgSharpness.toFixed(1)}/100`, "color: #ffa500");
  }
  
  // Export as JSON
  console.log("%cExport Data:", "color: cyan; font-weight: bold");
  console.log(JSON.stringify({
    scene,
    elapsed: elapsed.toFixed(1),
    frames: testMetrics.frames,
    sharpness: testMetrics.sharpnessScores,
  }, null, 2));
};

/**
 * Run automatic test sequence
 * Requires WebRTC Stats API access (may need to expose through preload)
 */
window.autoTestSequence = async function() {
  const scenes = [
    { name: "idle", duration: 10 },
    { name: "mouse_moving", duration: 10 },
    { name: "scrolling", duration: 10 },
    { name: "typing", duration: 10 },
    { name: "clicking", duration: 10 },
  ];
  
  console.log("%c[AutoTest] Starting automated test sequence", "color: cyan; font-weight: bold");
  
  for (const scene of scenes) {
    window.startTestScene(scene.name, scene.duration);
    
    // Wait for user to perform the action
    await new Promise(resolve => {
      console.log(`%c>>> Perform ${scene.name} action now, then press any key to continue...`, "color: yellow; font-weight: bold");
      document.addEventListener('keydown', function handler() {
        document.removeEventListener('keydown', handler);
        resolve();
      });
    });
    
    window.endTestScene();
    console.log("%c---", "color: gray");
    
    // Wait between scenes
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log("%c[AutoTest] Test sequence complete!", "color: cyan; font-weight: bold");
};

// Instructions
console.log(`%c
=== PairPair Adaptive Quality Test Guide ===

Manual Mode:
  1. window.startTestScene("idle", 10)    // Start idle test
  2. Manually interact with screen (or do nothing for idle)
  3. window.logMetric(60, 0, 0.78, 1920, 1080)  // Log metrics
  4. Repeat step 3 every 5 seconds
  5. window.endTestScene()  // End test

Auto Mode:
  1. window.autoTestSequence()  // Run all scenes automatically

`, "color: cyan; font-size: 12px; background: #1a1a2e; padding: 8px");
