const serverConfig = {
    sessionSecret: 'yourSessionSecret',
    savePath: './video',
    certPath: './ssl/cert.crt',
    keyPath: './ssl/private.key',
};

const databaseConfig = {
    database: 'user',
    user: 'yourUser',
    password: 'yourPassword',
};

const videoConfig = {
    width: 1920,
    height: 1080,
    frameRate: 15,
    sliceTime: 3000,
    allowRecord: {
        screen: true,
        camera: true,
    },
    mimeType: 'video/webm;codecs=h264'
};

const networkConfig = {
    socketPort: 7080,
    turnServerPort: 7100,
    turnServerUsername: 'yourTurnServerUsername',
    turnServerCredential: 'yourTurnServerCredential',
};

module.exports = {
    databaseConfig, serverConfig, videoConfig, networkConfig,
};