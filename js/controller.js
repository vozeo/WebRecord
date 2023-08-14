if (!navigator.getDisplayMedia && !navigator.mediaDevices.getDisplayMedia) {
    const error = '您的浏览器不支持录屏，请更换浏览器重试！';
    document.getElementById('screen-record-btn').style.display = 'none';
    document.getElementById('camera-record-btn').style.display = 'none';
    throw new Error(error);
}

let RecordList = {
    screen: {
        state: 'end', device: '', stream: null, recorder: null, peer: null,
    }, camera: {
        state: 'end', device: '', stream: null, recorder: null, peer: null,
    }
};

const getTime = (date = new Date()) => `${date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit'
}).replaceAll('/', '-')}-${date.toLocaleString('zh-CN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
}).replaceAll(':', '-')}`;
const editStr = str => str.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');

let Socket, SessionUser, AllTime = getTime();
let VideoConfig = {}, NetworkConfig = {};
let VideoWidth = 1920, VideoHeight = 1080, VideoRate = 15, SliceTime = 3000;


axios.get('/information').then(async (res) => {
    VideoConfig = res.data.videoConfig;
    NetworkConfig = res.data.networkConfig;
    SessionUser = res.data.sessionUser;

    VideoWidth = VideoConfig.width;
    VideoHeight = VideoConfig.height;
    VideoRate = VideoConfig.frameRate;
    SliceTime = VideoConfig.sliceTime;

    Notification.requestPermission().then();

    Socket = io(`https://${document.domain}:${NetworkConfig.socketPort}`, { rejectUnauthorized: false });
    Socket.on('connect', () => {
        Socket.emit('message', SessionUser.stu_no, 'online', true, () => {
            document.getElementById('online-state-btn').innerText = '已连接';
            AllTime = getTime();
            Object.values(RecordList).forEach(video => {
                if (video.state === 'pause') {
                    video.recorder.start(SliceTime);
                    video.state = 'start';
                }
            });
        });
    });
    Socket.on('disconnect', () => {
        Object.values(RecordList).forEach(video => {
            if (video.state === 'start') {
                video.recorder.stop();
                video.state = 'pause';
            }
        });
        document.getElementById('online-state-btn').innerText = '未连接';
    });
    Socket.on('notice', (target, data) => {
        if (target === 'all' || target === SessionUser.stu_no) sendNotification('收到通知', data, 'notice');
    });
    Socket.on('record', (arg) => {
        for (let type in RecordList) {
            if ((RecordList[type].state === 'end' && arg) || (RecordList[type].state === 'start' && !arg)) {
                document.getElementById(`${type}-record-btn`).click();
            }
            if (!arg) {
                if (window.Notification.permission === "granted") {
                    sendNotification(`${type === 'screen' ? '屏幕' : '摄像头'}录制结束`, `${type === 'screen' ? '屏幕' : '摄像头'}录制已被结束！`, 'end');
                }
                setTimeout(() => { location.reload(true); }, 3000);
            }
        }
    });
    Socket.on('disable', (arg) => {
        if (arg === SessionUser.stu_no) {
            window.location.replace('/logout');
        }
    });
    for (let type in RecordList) {
        if (VideoConfig.allowRecord[type]) {
            document.getElementById(`${type}-state`).style.display = 'block';
            document.getElementById(`${type}-container`).style.display = 'block';
        }
    }
    await sendScreenNumber();
});

const establishConnection = (type) => {
    const peer = new Peer(SessionUser.stu_no + type + RecordList[type].device, {
        host: document.domain, port: NetworkConfig.socketPort, path: "/webrtc", secure: true, config: {
            'iceServers': [{ url: 'stun:stun.l.google.com:19302' }, {
                url: `turn:${document.domain}:${NetworkConfig.turnServerPort}`,
                username: NetworkConfig.turnServerUsername,
                credential: NetworkConfig.turnServerCredential,
            }],
        }
    });
    peer.on('connection', (conn) => {
        conn.on('open', () => {
            peer.call(conn.peer, RecordList[type].stream);
        });
    });
    peer.on('disconnected', () => {
        peer.reconnect();
    });
    if (RecordList[type].peer) {
        RecordList[type].peer.destroy();
    }
    RecordList[type].peer = peer;
}

const addStreamStopListener = (stream, callback) => {
    const events = ['ended', 'inactive'];
    const resetCallback = () => callback = () => {
    };
    events.forEach(event => {
        stream.addEventListener(event, () => {
            callback();
            resetCallback();
        }, false);
        stream.getTracks().forEach(track => {
            track.addEventListener(event, () => {
                callback();
                resetCallback();
            }, false);
        });
    });
}


const invokeGetMedia = (success, error, type) => {
    const constraints = {
        audio: true, video: {
            width: { ideal: VideoWidth }, height: { ideal: VideoHeight }, frameRate: { ideal: VideoRate }
        }
    };
    if (type === 'screen') {
        if (navigator.mediaDevices.getDisplayMedia) {
            navigator.mediaDevices.getDisplayMedia(constraints).then(success).catch(error);
        } else {
            navigator.getDisplayMedia(constraints).then(success).catch(error);
        }
    } else {
        navigator.mediaDevices.getUserMedia(constraints).then(success).catch(error);
    }
}

const sendNotification = (title, content) => {
    new Notification(title, {
        body: content,
    })
}

const startRecord = (video, type) => {
    const device = editStr(video.getVideoTracks()[0].id.split('-')[0]);
    const recorder = new MediaRecorder(video, {
        mimeType: VideoConfig.mimeType,
    });
    RecordList[type] = {
        state: 'start', device: device, stream: video, recorder: recorder,
    }
    recorder.ondataavailable = (event) => {
        let fileObject = new File([event.data], device, {
            type: VideoConfig.mimeType
        });
        Socket.emit('file', SessionUser.stu_no, type, device, AllTime, fileObject);
    }
    recorder.onstart = () => {
        Socket.emit('message', SessionUser.stu_no, type, [device, AllTime], () => {
            document.getElementById(`${type}-state-btn`).innerText = `正在录制`;
            document.getElementById(`${type}-record-btn`).innerText = `结束${type === 'screen' ? '屏幕' : '摄像头'}录制`;
            document.getElementById(`${type}-record-btn`).className = "btn btn-danger btn-lg";
        });
    };
    recorder.start(SliceTime);
}

const endRecord = (type) => {
    const recorder = RecordList[type].recorder;
    if (recorder) {
        recorder.stop();
        const tracks = RecordList[type].stream.getTracks();
        tracks.forEach(track => track.stop());
    }
    Socket.emit('message', SessionUser.stu_no, type, false, () => {
        document.getElementById(`${type}-state-btn`).innerText = `未录制`;
        document.getElementById(`${type}-record-btn`).innerText = `开始${type === 'screen' ? '屏幕' : '摄像头'}录制`;
        document.getElementById(`${type}-record-btn`).className = "btn btn-primary btn-lg";
    });
}

let IntervalId;
const sendScreenNumber = async () => {
    const screens = await window.getScreenDetails();
    Socket.emit('screen', SessionUser.stu_no, screens.screens.length);
}

const recordButtonClick = (type) => {
    switch (RecordList[type].state) {
        case 'end':
            RecordList[type].state = 'start';
            if (window.Notification.permission === "granted") {
                if (type === 'screen') {
                    sendNotification('申请屏幕录制', '请前往录制窗口选择分享“整个屏幕”并勾选“分享系统中的音频”进行录制！', 'screen');
                } else {
                    sendNotification('摄像头录制开始', '请前往录制窗口允许摄像头和麦克风权限，如之前已允许，则已经开始录制！', 'camera');
                }
            }
            invokeGetMedia(async video => {
                addStreamStopListener(video, () => {
                    if (RecordList[type].state === 'start') {
                        document.getElementById(`${type}-record-btn`).click();
                    }
                });
                /*
                const permission = await navigator.permissions.query({
                    name: 'window-placement'
                });
                if (permission.state !== 'granted') {
                    alert('未选择同意“窗口管理”权限，请同意“窗口管理”权限！');
                    return;
                } else 
                */
                if (type === 'screen') {
                    const tracks = video.getTracks();
                    const hasShared = tracks.some(track => track.label.startsWith('screen'));
                    if (!hasShared) {
                        alert('未选择分享“整个屏幕”，请在录屏时选择分享“整个屏幕”并勾选“分享系统中的音频”！');
                        tracks.forEach(track => track.stop());
                        return;
                    }
                }
                IntervalId = setInterval(sendScreenNumber, VideoConfig.sliceTime);
                startRecord(video, type);
                establishConnection(type);
            }, (error) => {
                if (RecordList[type].state === 'start') {
                    document.getElementById(`${type}-record-btn`).click();
                }
                alert('远程录制未开始，请重试！');
            }, type);
            break;
        case 'pause':
        case 'start':
            RecordList[type].state = 'end';
            clearInterval(IntervalId);
            endRecord(type);
            break;
    }
}

document.getElementById('screen-record-btn').onclick = () => {
    if (VideoConfig.allowRecord.screen) {
        recordButtonClick('screen');
    }
};

document.getElementById('camera-record-btn').onclick = () => {
    if (VideoConfig.allowRecord.camera) {
        recordButtonClick('camera');
    }
};