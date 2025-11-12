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

// =======================================================
// [⭐ 2. 웹캠 시작 수정] - async/await 대신 .then() 사용
// =======================================================
function startVideo() {
    console.log("웹캠 시작 시도...");
    // 구형 브라우저 호환성을 위해 .then() 사용
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

// 4. 안내 문구 갱신 (우선순위 로직)
function updateMessage() {
    const isRaisingHand = poses.length > 0 && checkArmRaised(poses[0].pose);
    const isWearingHat = objectDetections.some(obj => obj.label === 'hat');
    const isWearingSunglasses = objectDetections.some(obj => obj.label === 'sunglasses');

    let topExpression = 'neutral';
    if (faceDetections.length > 0 && faceDetections[0].expressions) {
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
    else { 
        const time = getFormattedTime();
        currentMessage = `${time}분의 민지`; 
    }
}

// 5. 그리기 루프 (100ms마다 실행)
function drawLoop() {
    if (!ctx || (loadingMessage && loadingMessage.style.display === 'block')) return; // 로딩 메시지 확인
    
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
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function getTopExpression(expressions) {
    return Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);
}


// =======================================================
// [⭐ 스크립트 실행 수정] - async/await 대신 .then() 사용
// =======================================================
function main() {
    // 1. 비디오가 재생되면 모델 로드 및 감지 시작
    video.addEventListener('play', function() {
        console.log("Video is playing. Starting model load...");
        
        // async 함수인 loadModels()를 호출하고 .then()으로 후속 처리
        loadModels().then(function() {
            // loadModels가 성공적으로 완료된 후 (finally가 실행된 후)
            // (구형 브라우저 호환성을 위해 loadingMessage가 null인지 한번 더 체크)
            if (!loadingMessage || loadingMessage.style.display === 'none') { 
                startDetection();
                console.log("Detection started.");
            }
        });
    });
    
    // 2. 비디오 스트림 시작 (async/await 없이)
    startVideo(); 
}

// --- 스크립트 실행 ---
main();
