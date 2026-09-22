/** 与 scripts/quick-deploy.sh 内 QUICK_DEPLOY_PORT_PAIRS 保持一致 */
export const QUICK_DEPLOY_PORT_PAIRS = [
    [80, 443],
    [15080, 15443],
    [15580, 15943],
    [25080, 25443],
    [25580, 25943],
    [35080, 35443],
    [35580, 35943],
    [45080, 45443],
    [45580, 45943],
    [55080, 55443],
    [55580, 55943],
    [65080, 65443],
    [65580, 65943],
    [75080, 75443],
    [85080, 85443],
];

export function getQuickDeployHttpsPort(httpPort) {
    const http = Number(httpPort);
    const pair = QUICK_DEPLOY_PORT_PAIRS.find(([candidateHttp]) => candidateHttp === http);
    return pair ? pair[1] : null;
}

export function isQuickDeployHttpPort(httpPort) {
    return getQuickDeployHttpsPort(httpPort) != null;
}

export function formatLanUrl(protocol, host, port) {
    const value = Number(port);
    const isDefault = (protocol === 'http' && value === 80)
        || (protocol === 'https' && value === 443);
    if (isDefault) {
        return `${protocol}://${host}`;
    }
    return `${protocol}://${host}:${value}`;
}
