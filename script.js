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

// 1. 모델 로드
async function loadModels() {
    console.log("모델 로딩 시작...");
    loadingMessage.style.display = 'block'; // 로딩 메시지 표시

    try {
        // 1-1. face-api (얼굴 기준점)
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        console.log("얼굴 모델 완료!");
        
        // 1-2. coco-ssd (사물: 모자) - 'cocossd'
        objectDetector = await ml5.objectDetector('cocossd');
        console.log("사물 모델 완료!");
        
        // 1-3. PoseNet (신체 포즈: 팔 들기)
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
    // 캔버스 생성
    canvas = faceapi.createCanvasFromMedia(video);
    videoContainer.append(canvas);
    displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);

    // 각 모델의 감지 루프 실행
    detectFaces();    // face-api 루프
    detectObjects();  // coco-ssd 루프
    detectPoses();    // PoseNet 루프
    
    // 그리기 루프 (초당 10회)
    setInterval(drawLoop, 100); 

    // 안내 문구 갱신 루프 (3초마다)
    messageTimer = setInterval(updateMessage, 3000); // 3초마다 문구 결정
}

// 3-1. 얼굴 감지 루프 (face-api)
async function detectFaces() {
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
    faceDetections = faceapi.resizeResults(detections, displaySize);
    requestAnimationFrame(detectFaces); 
}

// 3-2. 사물 감지 루프 (coco-ssd)
function detectObjects() {
    if (objectDetector) { 
        objectDetector.detect(video, (err, results) => {
            if (err) console.error(err);
            objectDetections = results || [];
            detectObjects(); 
        });
    }
}

// 3-3. 포즈 감지 루프 (PoseNet)
function detectPoses() {
    if (poseNet) { 
        poseNet.on('pose', (results) => {
            poses = results;
        });
    }
}

// =======================================================
// [⭐ 수정된 핵심 로직] 4. 안내 문구 갱신 (우선순위 적용)
// =======================================================
function updateMessage() {
    // --- 1. 모든 조건 상태를 먼저 확인합니다 ---
    const isRaisingHand = poses.length > 0 && checkArmRaised(poses[0].pose);
    const isWearingHat = objectDetections.some(obj => obj.label === 'hat');
    const isWearingSunglasses = objectDetections.some(obj => obj.label === 'sunglasses');
    const isMultiplePeople = faceDetections.length > 1; // (보너스 조건)

    // --- 2. 요청하신 우선순위(위계)에 따라 문구를 결정합니다 ---
    
    // 최우선 순위: 팔 들기 (Pose)
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
    // 4순위: 여러 사람 (보너스)
    else if (isMultiplePeople) {
        currentMessage = "두 분이 함께 있네요!";
    }
    // 5순위: 기본값 (Default)
    else {
        const time = getFormattedTime(); // 헬퍼 함수 호출
        currentMessage = `${time}분의 민지`; 
    }
    // 'if...else if...else' 구문을 사용했기 때문에
    // 'isRaisingHand'가 true이면, 모자를 썼든 안 썼든 무조건 "손을 번쩍!" 메시지만 뜹니다.
}

// 5. 그리기 루프 (100ms마다 실행)
function drawLoop() {
    if (!canvas || loadingMessage.style.display === 'block') return; 
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (faceDetections.length > 0) {
        // [얼굴 감지됨]
        // 'box' 오류 수정된 상태
        const box = faceDetections[0].box; 
        
        // 'currentMessage'는 updateMessage가 3초마다 갱신한 값을 사용
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
