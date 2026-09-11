// Copyright 2023-2026 The MathWorks, Inc.

import BaseService from '../BaseService'

export interface TelemetryEvent {
    eventKey: string
    data: unknown
}

export default class TelemetryLogger extends BaseService {
    constructor (_extensionVersion: string) {
        super()
    }

    logEvent (_event: TelemetryEvent): void {
        // 内置版本不冒用上游应用凭据发送遥测，保留调用接口以兼容各功能服务。
        return
    }
}
