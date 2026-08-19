"use server";

import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { orgDb } from "@/lib/db";

export async function updateOwnAccount(
  _prevState: string | undefined,
  formData: FormData,
) {
  const session = await auth();
  if (!session?.user) return "로그인이 필요합니다.";

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const newPasswordConfirm = String(formData.get("newPasswordConfirm") ?? "");

  if (!currentPassword) {
    return "현재 비밀번호를 입력하세요.";
  }

  const user = await orgDb.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) return "사용자를 찾을 수 없습니다.";

  const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!passwordValid) return "현재 비밀번호가 올바르지 않습니다.";

  // 정책상 로그인 이메일(아이디)은 본인도 변경할 수 없다 - 비밀번호만 바꿀 수 있다.
  if (!newPassword && !newPasswordConfirm) return "변경할 내용이 없습니다.";
  if (newPassword.length < 8) return "새 비밀번호는 8자 이상이어야 합니다.";
  if (newPassword !== newPasswordConfirm) return "새 비밀번호가 일치하지 않습니다.";

  await orgDb.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });

  return "저장되었습니다.";
}
