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

// 1. 모델 로드 (내부는 async/await 유지)
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

    // 경고 해결: willReadFrequently 옵션 추가
    ctx = canvas.getContext('2d', { willReadFrequently: true }); 

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
// [⭐ 수정된 핵심 로직] 4. 안내 문구 갱신 (방법 1: 기준점 적용)
// =======================================================
function updateMessage() {
    // --- 1. 모든 조건 상태를 먼저 확인합니다 ---
    const isRaisingHand = poses.length > 0 && checkArmRaised(poses[0].pose);
    const isWearingHat = objectDetections.some(obj => obj.label === 'hat');
    const isWearingSunglasses = objectDetections.some(obj => obj.label === 'sunglasses');

    let topExpression = 'neutral';
    let expressions = null; // 표정 객체를 저장할 변수

    if (faceDetections.length > 0 && faceDetections[0].expressions) {
        expressions = faceDetections[0].expressions; // 7가지 확률 모두 저장
        topExpression = getTopExpression(expressions);
    }

    // --- 2. 요청하신 우선순위(위계)에 따라 문구를 결정합니다 ---
    
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
    
    // [⭐ 수정된 부분]
    // 4순위: 'Happy' 표정이 50% 이상이면 (neutral보다 낮아도) 인정
    // (expressions가 null이 아닌지 확인)
    else if (expressions && expressions.happy > 0.5) { // 0.5 = 50%
        currentMessage = '웃고 있는 민지';
    }
    // 5순위: 'Surprised' 표정이 70% 이상이면 인정
    else if (expressions && expressions.surprised > 0.7) { // 0.7 = 70%
        currentMessage = '놀란 표정의 민지';
    }
    
    // 6순위: (나머지 표정들 - 1등을 찾은 결과(topExpression) 기준)
    else if (topExpression === 'sad') {
        currentMessage = '슬픈 민지';
    }
    else if (topExpression === 'angry') {
        currentMessage = '화난 표정의 민지';
    }
    else if (topExpression === 'disgusted') {
        currentMessage = '불만스러운 민지';
    }
    else if (topExpression === 'fearful') {
        currentMessage = '두려워하고 있는 민지';
    }
    
    // 7순위: 기본값 (neutral 표정 또는 그 외 모든 경우)
    else { 
        const time = getFormattedTime();
        currentMessage = `${time}분의 민지`; 
    }
}


// 5. 그리기 루프 (100ms마다 실행)
function drawLoop() {
    if (!ctx || (loadingMessage && loadingMessage.style.display === 'block')) return; 
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (faceDetections.length > 0) {
        const box = faceDetections[0].detection.box; 
        
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; 
        ctx.fillRect(box.x - 10, box.y - 40, box.width + 20, 35);
        ctx.fillStyle = "#FFFF00"; 
        ctx.font = '22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(currentMessage, box.x + box.width / 2, box.y - 15);

    } else { 
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
    // (한국 시간 기준 - KST는 UTC+9)
    // 브라우저의 로컬 시간 기준으로 작동하므로 별도 시간대 설정은 필요 없습니다.
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// (헬퍼 3) 가장 확률이 높은 표정 찾기 (원본 로직)
function getTopExpression(expressions) {
    return Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);
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
