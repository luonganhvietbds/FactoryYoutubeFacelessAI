import { ActionCodeSettings } from "firebase/auth";

export const actionCodeSettings: ActionCodeSettings = {
    url: typeof window !== "undefined" ? `${window.location.origin}/login` : "http://localhost:3000/login",
    handleCodeInApp: true,
    iOS: {
        bundleId: "com.ai-script-factory.app",
    },
    android: {
        packageName: "com.ai.script.factory",
        installApp: true,
        minimumVersion: "1.0.0",
    },
    dynamicLinkDomain: "aiscriptfactory.page.link",
};

export const getActionCodeSettings = (continueUrl?: string): ActionCodeSettings => ({
    url: continueUrl || (typeof window !== "undefined" ? `${window.location.origin}/login` : "http://localhost:3000/login"),
    handleCodeInApp: true,
    iOS: {
        bundleId: "com.ai-script-factory.app",
    },
    android: {
        packageName: "com.ai.script.factory",
        installApp: true,
        minimumVersion: "1.0.0",
    },
    dynamicLinkDomain: "aiscriptfactory.page.link",
});

export const continueLoginUrl = "/";

export function getFirebaseErrorMessage(errorCode: string): string {
    const errorMessages: Record<string, string> = {
        "auth/user-not-found": "Email không tồn tại trong hệ thống",
        "auth/wrong-password": "Mật khẩu không chính xác",
        "auth/invalid-email": "Email không hợp lệ",
        "auth/email-already-in-use": "Email đã được sử dụng",
        "auth/weak-password": "Mật khẩu quá yếu (ít nhất 6 ký tự)",
        "auth/user-disabled": "Tài khoản đã bị vô hiệu hóa",
        "auth/operation-not-allowed": "Thao tác không được phép",
        "auth/expired-action-code": "Liên kết đã hết hạn",
        "auth/invalid-action-code": "Liên kết không hợp lệ",
        "auth/network-request-failed": "Lỗi kết nối mạng",
        "auth/too-many-requests": "Quá nhiều yêu cầu. Vui lòng thử lại sau",
        "auth/popup-closed-by-user": "Cửa sổ đăng nhập đã bị đóng",
        "auth/cancelled-popup-request": "Yêu cầu đăng nhập đã bị hủy",
    };

    return errorMessages[errorCode] || "Đã xảy ra lỗi. Vui lòng thử lại";
}
