const video = document.getElementById('video');
const videoContainer = document.getElementById('videoContainer');
const loadingMessage = document.getElementById('loadingMessage');
let canvas;
let displaySize;
let ctx; // 캔버스 context를 전역으로 선언

const MODEL_URL = './models'; 

// [수정됨] PoseNet, ObjectDetector 관련 변수 제거
let faceDetections = [];

let currentMessage = "카메라를 바라보세요";
let messageTimer;

// 1. 모델 로드 [수정됨] - face-api 모델만 로드
async function loadModels() {
    console.log("모델 로딩 시작...");
    loadingMessage.style.display = 'block'; 

    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
        console.log("얼굴/표정 모델 완료!");
        
        // poseNet, objectDetector 로드 코드 제거
        
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

// 3. 실시간 감지 시작 (메인 함수) [수정됨]
function startDetection() {
    canvas = faceapi.createCanvasFromMedia(video);
    videoContainer.append(canvas);
    displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);
    ctx = canvas.getContext('2d', { willReadFrequently: true }); 

    // 감지 루프 실행 (detectFaces만 실행)
    detectFaces();    
    // detectObjects(), detectPoses() 호출 제거
    
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

// [수정됨] 3-2, 3-3 (detectObjects, detectPoses) 함수 제거

// 4. 안내 문구 갱신 (우선순위 로직) [수정됨]
function updateMessage() {
    // [수정됨] 포즈, 사물 감지 로직(isRaisingHand 등) 모두 제거

    let topExpression = 'neutral';
    if (faceDetections.length > 0 && faceDetections[0].expressions) {
        // 'neutral'을 제외한 1등을 찾는 헬퍼 함수 호출
        topExpression = getTopExpression(faceDetections[0].expressions);
    }

    // --- 표정 또는 기본값만 표시 ---
    if (topExpression === 'happy') {
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


// 5. 그리기 루프 (100ms마다 실행) [수정됨]
function drawLoop() {
    if (!ctx || (loadingMessage && loadingMessage.style.display === 'block')) return; 
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (faceDetections.length > 0) {
        const box = faceDetections[0].detection.box; 
        
        // 메인 메시지 그리기
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; 
        ctx.fillRect(box.x - 10, box.y - 40, box.width + 20, 35);
        ctx.fillStyle = "#FFFF00"; 
        ctx.font = '22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(currentMessage, box.x + box.width / 2, box.y - 15);
        
        // [수정됨] 디버그 텍스트 제거 (코드를 최대한 가볍게 하기 위해)

    } else { 
        // [얼굴 감지 안됨]
        ctx.fillStyle = "#FFFFFF";
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("카메라를 바라보세요", canvas.width / 2, canvas.height / 2); 
    }
}

// --- 헬퍼 함수 (Helper Functions) ---

// [수정됨] checkArmRaised 함수 제거

function getFormattedTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// (헬퍼) 'Neutral'을 제외한 1등 표정 찾기 (정확도 포기, 0.01%도 1등으로 인정)
function getTopExpression(expressions) {
    const expressionsWithoutNeutral = { ...expressions };
    delete expressionsWithoutNeutral.neutral;
    
    let topEmotion = 'neutral';
    let maxProb = 0.0;

    for (const [emotion, prob] of Object.entries(expressionsWithoutNeutral)) {
        if (prob > maxProb) {
            maxProb = prob;
            topEmotion = emotion;
        }
    }
    
    // 6개 감정 점수가 모두 0일 때만 'neutral' 반환
    if (maxProb === 0.0) {
        return 'neutral';
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
