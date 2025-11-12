const video = document.getElementById('video');
const videoContainer = document.getElementById('videoContainer');
const loadingMessage = document.getElementById('loadingMessage');
let canvas;
let displaySize;
let ctx; // 캔버스 context를 전역으로 선언

const MODEL_URL = './models'; 

// [수정됨] faceDetections 배열 하나만 남김
let faceDetections = [];

let currentMessage = "카메라를 바라보세요"; // 이 메시지가 바뀌면 성공
let messageTimer;

// 1. 모델 로드 [수정됨] - 'tinyFaceDetector' 단 하나만 로드
async function loadModels() {
    console.log("모델 로딩 시작...");
    loadingMessage.style.display = 'block'; 

    try {
        // [수정됨] 랜드마크, 표정 모델 로드 제거
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        console.log("얼굴 탐지 모델 완료!");
        
        // [수정됨] 사물, 포즈 모델 로드 제거
        
        console.log("모든 모델 로드 완료!");
    } catch (error) {
        console.error("모델 로드 실패:", error);
        loadingMessage.innerText = "모델 로드에 실패했습니다. 새로고침 해주세요.";
    } finally {
        loadingMessage.style.display = 'none'; 
    }
}

// 2. 웹캠 시작 (이전과 동일)
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
    
    // 그리기 및 갱신 루프
    setInterval(drawLoop, 100); 
    
    // [수정됨] updateMessage는 3초마다 시간 갱신용으로만 사용
    messageTimer = setInterval(updateMessage, 3000); 
}

// 3-1. 얼굴/표정 감지 루프 [수정됨]
async function detectFaces() {
    // [수정됨] 표정, 랜드마크 기능(.with...) 완전 제거
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
    
    // [⭐ 중요] 콘솔에 이 로그가 0이 아닌 1이 찍히는지 확인하세요!
    console.log('얼굴 감지 루프 실행 중... 찾은 얼굴:', detections.length);
                                
    faceDetections = faceapi.resizeResults(detections, displaySize);
    requestAnimationFrame(detectFaces); 
}

// 4. 안내 문구 갱신 (우선순위 로직) [수정됨]
function updateMessage() {
    // [수정됨] 이 함수의 유일한 역할은 '현재 시간' 문구를 갱신하는 것
    const time = getFormattedTime();
    currentMessage = `${time}분의 민지`; 
}


// 5. 그리기 루프 (100ms마다 실행) [수정됨]
function drawLoop() {
    if (!ctx || (loadingMessage && loadingMessage.style.display === 'block')) return; 
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // [수정됨] 얼굴이 감지되면 -> (시간)의 민지 표시
    // 감지 안되면 -> "카메라를..." 표시
    if (faceDetections.length > 0) {
        
        // [수정됨] 표정 감지를 안 하므로, box 경로는 .detection이 빠짐
        const box = faceDetections[0].box; 
        
        // 메인 메시지 그리기 (updateMessage가 갱신한 시간)
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

// [수정됨] checkArmRaised, getTopExpression 함수 제거

function getFormattedTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
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
