import { Conversation } from './../conversation';
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Base64String } from './cryptoUtilityService';
import { url } from 'inspector';

export interface SetupKeysPayload {
    public_key: Base64String;
    wrapped_private_key: Base64String;
    kek_iv: Base64String;
    pin_salt: Base64String;
}

export interface ConversationKeyVaultPayload {
    user_id: string;
    conversation_id: string;
    wrapped_shared_key: Base64String;
    key_version: number;
}

@Injectable({
    providedIn: 'root',
})
export class E2eeApiService {
    apiUrl = environment.apiUrl + '/e2ee';
    httpClient = inject(HttpClient);

    setupKeys(setupKeys: SetupKeysPayload) {
        return this.httpClient.post<any>(`${this.apiUrl}/setup`, setupKeys);
    }

    checkStatus() {
        return this.httpClient.get<any>(`${this.apiUrl}/status`);
    }

    getMyKeys() {
        return this.httpClient.get<any>(`${this.apiUrl}/keys`);
    }

    getConversationMemberKeys(conversation_id: string) {
        return this.httpClient.get<any>(
            `${this.apiUrl}/conversation-member-keys/${conversation_id}`,
        );
    }

    addConversationKeys(conversation_key_vaults: ConversationKeyVaultPayload[]) {
        return this.httpClient.post(`${this.apiUrl}/conversation-keys`, {
            conversation_key_vaults,
        });
    }

    getConversationKey(conversation_id: string, key_version: number) {
        return this.httpClient.get<any>(
            `${this.apiUrl}/conversation-key/${conversation_id}/${key_version}`,
        );
    }

    getConversationKeys() {
        return this.httpClient.get<any>(`${this.apiUrl}/conversation-keys`);
    }

    getLatestConversationKey(conversation_id: string) {
        return this.httpClient.get<any>(
            `${this.apiUrl}/latest-conversation-key/${conversation_id}`,
        );
    }
}
