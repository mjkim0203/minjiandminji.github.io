const video = document.getElementById('video');
const videoContainer = document.getElementById('videoContainer');
const loadingMessage = document.getElementById('loadingMessage');
let canvas;
let displaySize;
let ctx; // 캔버스 context를 전역으로 선언

const MODEL_URL = './models'; 

let objectDetector;
let poseNet;

let faceDetections = [];
let objectDetections = [];
let poses = [];

let currentMessage = "카메라를 바라보세요";
let messageTimer;

// 1. 모델 로드
async function loadModels() {
    console.log("모델 로딩 시작...");
    loadingMessage.style.display = 'block'; 

    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
        console.log("얼굴/표정 모델 완료!");
        
        objectDetector = await ml5.objectDetector('cocossd');
        console.log("사물 모델 완료!");
        
        poseNet = await ml5.poseNet(video, () => console.log('PoseNet 모델 완료!'));
        console.log("모든 모델 로드 완료!");
    } catch (error) {
        console.error("모델 로드 실패:", error);
        loadingMessage.innerText = "모델 로드에 실패했습니다. 새로고침 해주세요.";
    } finally {
        loadingMessage.style.display = 'none'; 
    }
}

// 2. 웹캠 시작 (구형 브라우저 호환 .then() 사용)
function startVideo() {
    console.log("웹캠 시작 시도...");
    navigator.mediaDevices.getUserMedia({ video: {} })
        .then(function(stream) {
            console.log("웹캠 스트림 확보 성공.");
            video.srcObject = stream;
        })
        .catch(function(err) {
            console.error("웹캠 접근 오류:", err);
            loadingMessage.style.display = 'block';
            loadingMessage.innerText = "웹캠 권한을 허용해주세요.";
        });
}

// 3. 실시간 감지 시작 (메인 함수)
function startDetection() {
    canvas = faceapi.createCanvasFromMedia(video);
    videoContainer.append(canvas);
    displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);
    ctx = canvas.getContext('2d', { willReadFrequently: true }); 
    detectFaces();    
    detectObjects();  
    detectPoses();    
    setInterval(drawLoop, 100); 
    messageTimer = setInterval(updateMessage, 3000); 
}

// 3-1. 얼굴/표정 감지 루프
async function detectFaces() {
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
                                .withFaceLandmarks()
                                .withFaceExpressions();
    faceDetections = faceapi.resizeResults(detections, displaySize);
    requestAnimationFrame(detectFaces); 
}

// 3-2. 사물 감지 루프
function detectObjects() {
    if (objectDetector) { 
        objectDetector.detect(video, (err, results) => {
            if (err) console.error(err);
            objectDetections = results || [];
            detectObjects(); 
        });
    }
}

// 3-3. 포즈 감지 루프
function detectPoses() {
    if (poseNet) { 
        poseNet.on('pose', (results) => {
            poses = results;
        });
    }
}

// 4. 안내 문구 갱신 (우선순위 로직)
function updateMessage() {
    const isRaisingHand = poses.length > 0 && checkArmRaised(poses[0].pose);
    const isWearingHat = objectDetections.some(obj => obj.label === 'hat');
    const isWearingSunglasses = objectDetections.some(obj => obj.label === 'sunglasses');

    let topExpression = 'neutral';
    if (faceDetections.length > 0 && faceDetections[0].expressions) {
        // [⭐ 수정된 getTopExpression 함수를 호출]
        // (Neutral을 제외한 1등을 무조건 반환)
        topExpression = getTopExpression(faceDetections[0].expressions);
    }

    if (isRaisingHand) {
        currentMessage = "손을 번쩍 드셨군요!";
    } 
    else if (isWearingHat) {
        currentMessage = "멋진 모자를 쓰셨네요!";
    } 
    else if (isWearingSunglasses) {
        currentMessage = "선글라스가 잘 어울려요.";
    }
    else if (topExpression === 'happy') {
        currentMessage = '웃고 있는 민지';
    }
    else if (topExpression === 'sad') {
        currentMessage = '슬픈 민지';
    }
    else if (topExpression === 'angry') {
        currentMessage = '화난 표정의 민지';
    }
    else if (topExpression === 'disgusted') {
        currentMessage = '불만스러운 민지';
    }
    else if (topExpression === 'surprised') {
        currentMessage = '놀란 표정의 민지';
    }
    else if (topExpression === 'fearful') {
        currentMessage = '두려워하고 있는 민지';
    }
    else { // 'neutral' (기본값)
        const time = getFormattedTime();
        currentMessage = `${time}분의 민지`; 
    }
}

// =======================================================
// [⭐ 5. 그리기 루프 수정] - 디버그 텍스트 추가
// =======================================================
function drawLoop() {
    if (!ctx || (loadingMessage && loadingMessage.style.display === 'block')) return; 
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (faceDetections.length > 0) {
        const box = faceDetections[0].detection.box; 
        
        // 1. 메인 메시지 그리기 (3초마다 갱신)
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; 
        ctx.fillRect(box.x - 10, box.y - 40, box.width + 20, 35);
        ctx.fillStyle = "#FFFF00"; 
        ctx.font = '22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(currentMessage, box.x + box.width / 2, box.y - 15);

        // 2. [⭐ 디버그 텍스트 추가]
        // 현재 AI가 보는 가장 높은 표정(neutral 포함)을 실시간으로 표시
        if (faceDetections[0].expressions) {
            const expressions = faceDetections[0].expressions;
            // neutral 포함 1등 찾기 (원본 로직)
            const rawTopEmotion = Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);
            const rawTopProb = expressions[rawTopEmotion].toFixed(2); // 소수점 2자리

            const debugText = `[AI가 보는 표정: ${rawTopEmotion} (${rawTopProb})]`;
            
            ctx.fillStyle = "#FFFFFF"; // 흰색
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            // 메인 메시지 박스 아래에 표시
            ctx.fillText(debugText, box.x + box.width / 2, box.y + box.height + 20); 
        }

    } else { 
        // [얼굴 감지 안됨]
        ctx.fillStyle = "#FFFFFF";
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("카메라를 바라보세요", canvas.width / 2, canvas.height / 2); 
    }
}

// --- 헬퍼 함수 (Helper Functions) ---

function checkArmRaised(pose) {
    if (!pose || !pose.keypoints) return false;
    const minConfidence = 0.2; 
    const leftWrist = pose.keypoints.find(k => k.part === 'leftWrist');
    const leftShoulder = pose.keypoints.find(k => k.part === 'leftShoulder');
    const rightWrist = pose.keypoints.find(k => k.part === 'rightWrist');
    const rightShoulder = pose.keypoints.find(k => k.part === 'rightShoulder');
    if (leftWrist && leftShoulder && leftWrist.score > minConfidence && leftShoulder.score > minConfidence) {
        if (leftWrist.position.y < leftShoulder.position.y) return true;
    }
    if (rightWrist && rightShoulder && rightWrist.score > minConfidence && rightShoulder.score > minConfidence) {
        if (rightWrist.position.y < rightShoulder.position.y) return true;
    }
    return false;
}

function getFormattedTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// =======================================================
// [⭐ 수정된 헬퍼 3] - Neutral 무시, 최소 점수(0.1) 기준 제거
// =======================================================
function getTopExpression(expressions) {
    
    // 1. expressions 객체를 복사합니다.
    const expressionsWithoutNeutral = { ...expressions };
    
    // 2. 복사된 객체에서 'neutral' 키를 삭제합니다.
    delete expressionsWithoutNeutral.neutral;
    
    // 3. 'neutral'이 제거된 나머지 6개 표정 중에서 1등을 찾습니다.
    let topEmotion = 'neutral'; // 기본값은 neutral
    let maxProb = 0.0;

    for (const [emotion, prob] of Object.entries(expressionsWithoutNeutral)) {
        if (prob > maxProb) {
            maxProb = prob;
            topEmotion = emotion;
        }
    }
    
    // 4. [수정됨] 최소 점수 기준(0.1)을 제거합니다.
    // 0.01%라도 1등이면 1등으로 반환합니다.
    if (maxProb === 0.0) {
        return 'neutral'; // 6개 감정 점수가 모두 0일 때만 neutral
    }

    return topEmotion;
}


// --- 스크립트 실행 (구형 호환) ---
function main() {
    video.addEventListener('play', function() {
        console.log("Video is playing. Starting model load...");
        
        loadModels().then(function() {
            if (!loadingMessage || loadingMessage.style.display === 'none') { 
                startDetection();
                console.log("Detection started.");
            }
        });
    });
    
    startVideo(); 
}

main();
