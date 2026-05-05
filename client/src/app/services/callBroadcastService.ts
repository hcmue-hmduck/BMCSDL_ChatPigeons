import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root',
})
export class CallBroadcastService {
    private channel = new BroadcastChannel('call_channel');

    emitEvent(type: 'call_close', data: any) {
        this.channel.postMessage({type, data});
    }

    listenEvents(callback: (event: any) => void) {
        this.channel.onmessage = (event) => callback(event.data);
    }
}
