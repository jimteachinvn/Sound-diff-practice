export function validateFamilyDeletionConfirmation(phone: string, confirmation: unknown): void {
  if (typeof confirmation !== "string" || confirmation.trim() !== phone) {
    throw new Error("Hãy nhập đúng số điện thoại của gia đình để xác nhận xóa.");
  }
}
