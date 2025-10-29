const video = document.getElementById('video');
const videoContainer = document.getElementById('videoContainer');
const loadingMessage = document.getElementById('loadingMessage');
let canvas;
let displaySize;

// GitHub 저장소의 'models' 폴더를 참조 (상대 경로)
const MODEL_URL = './models'; 

// 모델 인스턴스
let objectDetector;
let poseNet;

// 감지 결과 저장용 변수
let faceDetections = [];
let objectDetections = [];
let poses = [];

// 안내 문구 관련
let currentMessage = "카메라를 바라보세요"; // 초기 메시지
let messageTimer;

// 1. 모델 로드 (표정 인식 모델 포함)
async function loadModels() {
    console.log("모델 로딩 시작...");
    loadingMessage.style.display = 'block'; 

    try {
        // 1-1. face-api
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
        console.log("얼굴/표정 모델 완료!");
        
        // 1-2. coco-ssd (사물)
        objectDetector = await ml5.objectDetector('cocossd');
        console.log("사물 모델 완료!");
        
        // 1-3. PoseNet (포즈)
        poseNet = await ml5.poseNet(video, () => console.log('PoseNet 모델 완료!'));
        
        console.log("모든 모델 로드 완료!");
    } catch (error) {
        console.error("모델 로드 실패:", error);
        loadingMessage.innerText = "모델 로드에 실패했습니다. 새로고침 해주세요.";
    } finally {
        loadingMessage.style.display = 'none'; 
    }
}

// 2. 웹캠 시작
async function startVideo() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        video.srcObject = stream;
    } catch (err) {
        console.error("웹캠 접근 오류:", err);
        loadingMessage.style.display = 'block';
        loadingMessage.innerText = "웹캠 권한을 허용해주세요.";
    }
}

// 3. 실시간 감지 시작 (메인 함수)
function startDetection() {
    canvas = faceapi.createCanvasFromMedia(video);
    videoContainer.append(canvas);
    displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);

    // 감지 루프 실행
    detectFaces();    
    detectObjects();  
    detectPoses();    
    
    // 그리기 및 갱신 루프
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

// =======================================================
// [⭐ 수정된 핵심 로직] 4. 안내 문구 갱신 (새로운 우선순위)
// =======================================================
function updateMessage() {
    // --- 1. 모든 조건 상태를 먼저 확인합니다 ---
    const isRaisingHand = poses.length > 0 && checkArmRaised(poses[0].pose);
    const isWearingHat = objectDetections.some(obj => obj.label === 'hat');
    const isWearingSunglasses = objectDetections.some(obj => obj.label === 'sunglasses');

    // 표정 데이터 확인 (기본 'neutral')
    let topExpression = 'neutral';
    if (faceDetections.length > 0 && faceDetections[0].expressions) {
        topExpression = getTopExpression(faceDetections[0].expressions);
    }

    // --- 2. 요청하신 새로운 우선순위(위계)에 따라 문구를 결정합니다 ---
    
    // 1순위: 팔 들기 (Pose)
    if (isRaisingHand) {
        currentMessage = "손을 번쩍 드셨군요!";
    } 
    // 2순위: 모자 (Object)
    else if (isWearingHat) {
        currentMessage = "멋진 모자를 쓰셨네요!";
    } 
    // 3순위: 선글라스 (Object)
    else if (isWearingSunglasses) {
        currentMessage = "선글라스가 잘 어울려요.";
    }
    // 4순위: 표정 (happy)
    else if (topExpression === 'happy') {
        currentMessage = '웃고 있는 민지';
    }
    // 4순위: 표정 (sad)
    else if (topExpression === 'sad') {
        currentMessage = '슬픈 민지';
    }
    // 4순위: 표정 (angry)
    else if (topExpression === 'angry') {
        currentMessage = '화난 표정의 민지';
    }
    // 4순위: 표정 (disgusted)
    else if (topExpression === 'disgusted') {
        currentMessage = '불만스러운 민지';
    }
    // 4순위: 표정 (surprised)
    else if (topExpression === 'surprised') {
        currentMessage = '놀란 표정의 민지';
    }
    // 4순위: 표정 (fearful)
    else if (topExpression === 'fearful') {
        currentMessage = '두려워하고 있는 민지';
    }
    // 5순위: 기본값 (neutral 표정 또는 그 외 모든 경우)
    else { 
        const time = getFormattedTime();
        currentMessage = `${time}분의 민지`; 
    }
}

// 5. 그리기 루프 (100ms마다 실행)
function drawLoop() {
    if (!canvas || loadingMessage.style.display === 'block') return; 
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (faceDetections.length > 0) {
        // [얼굴 감지됨]
        // (표정 감지 후 경로 복구된 상태)
        const box = faceDetections[0].detection.box; 
        
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; 
        ctx.fillRect(box.x - 10, box.y - 40, box.width + 20, 35);
        ctx.fillStyle = "#FFFF00"; 
        ctx.font = '22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(currentMessage, box.x + box.width / 2, box.y - 15);

    } else { 
        // [얼굴 감지 안됨]
        ctx.fillStyle = "#FFFFFF";
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("카메라를 바라보세요", canvas.width / 2, canvas.height / 2); 
    }
}

// --- 헬퍼 함수 (Helper Functions) ---

// (헬퍼 1) 포즈 판별
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

// (헬퍼 2) 현재 시간을 HH:MM 형식으로 반환
function getFormattedTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// (헬퍼 3) 가장 확률이 높은 표정 찾기
function getTopExpression(expressions) {
    return Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);
}


// --- 스크립트 실행 ---
async function main() {
    video.addEventListener('play', async () => {
        console.log("Video is playing. Starting model load...");
        
        await loadModels(); 
        
        if (loadingMessage.style.display === 'none') { 
            startDetection();
            console.log("Detection started.");
        }
    });
    
    await startVideo(); 
}

main();
