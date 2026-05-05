import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Custom Validator để kiểm tra xem 2 trường trong form có khớp giá trị với nhau không.
 * Có thể tái sử dụng cho bất kỳ cặp trường nào (ví dụ: mật khẩu, email xác nhận, v.v.)
 * 
 * @param controlName Tên của trường thứ nhất (vd: 'password')
 * @param matchingControlName Tên của trường thứ hai (vd: 'confirm_password')
 * @returns ValidatorFn
 */
export function matchFieldsValidator(controlName: string, matchingControlName: string): ValidatorFn {
    return (formGroup: AbstractControl): ValidationErrors | null => {
        const control = formGroup.get(controlName);
        const matchingControl = formGroup.get(matchingControlName);

        // Nếu một trong 2 trường chưa khởi tạo xong thì bỏ qua
        if (!control || !matchingControl) {
            return null;
        }

        // Nếu có giá trị nhưng không giống nhau thì trả về lỗi
        if (control.value !== matchingControl.value) {
            return { passwordMismatch: true };
        }
        
        // Nếu hợp lệ
        return null;
    };
}
