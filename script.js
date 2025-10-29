const video = document.getElementById('video');
const videoContainer = document.getElementById('videoContainer');
const loadingMessage = document.getElementById('loadingMessage');
let canvas;
let displaySize;

// --- [수정됨] ---
const MODEL_URL = './models'; // ✅ 올바른 경로
// ---------------

// 모델 인스턴스
let objectDetector;
let poseNet;

// 감지 결과 저장용 변수
let faceDetections = [];
let objectDetections = [];
let poses = [];

// 안내 문구 관련
let currentMessage = "카메라를 바라보세요";
let messageTimer;

// 1. 모델 로드
async function loadModels() {
    console.log("모델 로딩 시작...");
    loadingMessage.style.display = 'block'; // 로딩 메시지 표시

    try {
        // 1-1. face-api (얼굴 기준점)
        // [수정됨] 로컬 경로(MODEL_URL) 사용
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        
        // 1-2. coco-ssd (사물: 모자)
        objectDetector = await ml5.objectDetector('cocosdd');
        
        // 1-3. PoseNet (신체 포즈: 팔 들기)
        poseNet = await ml5.poseNet(video, () => console.log('PoseNet 모델 로드 완료!'));
        
        console.log("모든 모델 로드 완료!");
    } catch (error) {
        console.error("모델 로드 실패:", error);
        loadingMessage.innerText = "모델 로드에 실패했습니다. 새로고침 해주세요.";
    } finally {
        loadingMessage.style.display = 'none'; // 로딩 메시지 숨김
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
    messageTimer = setInterval(updateMessage, 3000);
}

// 3-1. 얼굴 감지 루프 (face-api)
async function detectFaces() {
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
    faceDetections = faceapi.resizeResults(detections, displaySize);
    
    requestAnimationFrame(detectFaces); // 부드러운 루프
}

// 3-2. 사물 감지 루프 (coco-ssd)
function detectObjects() {
    if (objectDetector) { // 모델이 로드되었는지 확인
        objectDetector.detect(video, (err, results) => {
            if (err) console.error(err);
            objectDetections = results || [];
            
            detectObjects(); // 재귀 호출
        });
    }
}

// 3-3. 포즈 감지 루프 (PoseNet)
function detectPoses() {
    if (poseNet) { // 모델이 로드되었는지 확인
        poseNet.on('pose', (results) => {
            poses = results;
        });
    }
}

// 4. 안내 문구 갱신 로직 (3초마다 실행)
function updateMessage() {
    const possibleMessages = ["카메라가 당신을 보고 있습니다."]; // 기본 문구
    
    // 현재 감지된 상태 확인
    const isWearingHat = objectDetections.some(obj => obj.label === 'hat');
    const isRaisingHand = poses.length > 0 && checkArmRaised(poses[0].pose);
    const isWearingSunglasses = objectDetections.some(obj => obj.label === 'sunglasses');

    // 조건에 따라 메시지 추가
    if (isWearingHat) {
        possibleMessages.push("모자를 쓴 민지");
    }
    if (isWearingSunglasses) {
        possibleMessages.push("선글라스를 쓴 민지.");
    }
    if (isRaisingHand) {
        possibleMessages.push("손을 번쩍 든 민지!");
        possibleMessages.push("손을 들고 있는 민지");
    }
    if (faceDetections.length > 1) {
        possibleMessages.push("두 명의 민지");
    }

    // possibleMessages 배열에서 무작위로 하나 선택
    currentMessage = possibleMessages[Math.floor(Math.random() * possibleMessages.length)];
}

// 5. 그리기 루프 (100ms마다 실행)
function drawLoop() {
    if (!canvas) return; // 캔버스가 준비되지 않았으면 종료
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (faceDetections.length > 0) {
        // 첫 번째 사람의 얼굴을 기준으로 문구 표시
        const box = faceDetections[0].detection.box;
        
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; // 반투명 검은 배경
        ctx.fillRect(box.x - 10, box.y - 40, box.width + 20, 35);
        
        ctx.fillStyle = "#FFFF00"; // 노란색 텍스트
        ctx.font = '22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(currentMessage, box.x + box.width / 2, box.y - 15);
    } else if (loadingMessage.style.display === 'none') { // 로딩 중이 아닐 때만
        // 감지된 얼굴이 없으면 중앙에 표시
        ctx.fillStyle = "#FFFFFF";
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(currentMessage, canvas.width / 2, canvas.height / 2);
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

    if (leftWrist && leftShoulder && 
        leftWrist.score > minConfidence && leftShoulder.score > minConfidence) {
        if (leftWrist.position.y < leftShoulder.position.y) return true;
    }
    
    if (rightWrist && rightShoulder && 
        rightWrist.score > minConfidence && rightShoulder.score > minConfidence) {
        if (rightWrist.position.y < rightShoulder.position.y) return true;
    }
    
    return false;
}

// --- 스크립트 실행 ---
async function main() {
    // 1. 비디오가 재생될 준비가 되면 모델 로드 및 감지 시작
    video.addEventListener('play', async () => {
        console.log("Video is playing. Starting model load...");
        
        await loadModels(); // 모델 로드 (이 함수 안에 로딩 메시지 표시/숨김 로직 포함)
        
        if (loadingMessage.style.display === 'none') { // 모델 로드 성공 시에만
            startDetection();
            console.log("Detection started.");
        }
    });
    
    // 2. 비디오 스트림 시작
    await startVideo(); 
}

main();
