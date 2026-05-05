export interface LoginPayload {
    email: string;
    password: string;
}

export interface SignupPayload {
    full_name: string;
    email: string;
    password: string;
    remember: boolean;
}
