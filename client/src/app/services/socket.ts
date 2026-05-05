import { inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment'; @Injectable({
    providedIn: 'root',
})
export class SocketService {
    private socket?: Socket;
    platformId = inject(PLATFORM_ID);
    private ngZone = inject(NgZone);
    private eventCallbackMap = new Map<string, Map<(data: any) => void, (data: any) => void>>();

    constructor() {
        if (!isPlatformBrowser(this.platformId)) {
            return;
        }

        this.socket = io(environment.apiUrl, {
            withCredentials: true,
        });

        this.socket.on('connect', () => {
            console.log('Đã kết nối Socket.io thành công với ID:', this.socket?.id);
        });
    }

    emit(event: string, data: any) {
        this.socket?.emit(event, data);
    }

    on(event: string, callback: (data: any) => void) {
        const wrappedCallback = (data: any) => {
            this.ngZone.run(() => callback(data));
        };

        let callbacks = this.eventCallbackMap.get(event);
        if (!callbacks) {
            callbacks = new Map();
            this.eventCallbackMap.set(event, callbacks);
        }

        callbacks.set(callback, wrappedCallback);
        this.socket?.on(event, wrappedCallback);
    }

    off(event: string, callback?: (data: any) => void) {
        if (callback) {
            const wrappedCallback = this.eventCallbackMap.get(event)?.get(callback);
            if (wrappedCallback) {
                this.socket?.off(event, wrappedCallback);
                this.eventCallbackMap.get(event)?.delete(callback);
            }
        } else {
            this.socket?.off(event);
            this.eventCallbackMap.delete(event);
        }
        console.log(`Đã ngắt kết nối sự kiện: ${event}`);
    }
}