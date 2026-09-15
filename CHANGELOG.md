# NamLauncher Changelog

<!-- Author/creator: nattapat2871 (https://nattapat2871.me) -->

## 1.2.4
date: 2026-09-15
status: stable
commit: 229a152c3a3f2b6da57d10408c3712ff81ccff20

### English

- Refactors the large launcher entry points into focused UI, state, Minecraft,
  content-library, skin-library, update, and platform modules while preserving
  the existing Electron security boundary.
- Adds a responsive skin library with search, tags, pagination, previews, saved
  skins, model detection, theme-aware surfaces, and automatic retry on the
  initial load.
- Adds device, dark, and soft-light themes with accessible contrast, consistent
  icons, visible account controls, and animated theme transitions.
- Improves instance content management with loader update notices, clearer
  stable and unstable labels, exact mod-version selection, and protected
  NamLauncher companion provisioning.
- Introduces a verified Current User application-bundle updater with SHA-256
  validation, process-correlated health confirmation, automatic rollback, and
  the existing installer path as the safe fallback.
- Ships integrity-pinned stable companion artifacts for the maintained Fabric,
  Forge, and NeoForge targets. Legacy targets remain frozen at their previously
  supported companion versions.
- Keeps error reports sanitized and routes only confirmed launcher failures
  through the configured private reporting service.
- Completes drag-and-drop imports with visible per-file progress and a clear
  success state instead of leaving the instance page spinning.
- Keeps the minimize, maximize, and close controls visible when the launcher
  window is narrowed.
- Moves Windows installation and updates to Current User, safely migrates a
  verified legacy All Users installation, and preserves the existing data path.
- Shows the selected saved skin or official default skin head in Discord IPC
  for Offline profiles, together with the Offline player name.
- Publishes Windows, Linux, and macOS packages with SHA-256 sidecars and build
  provenance. Version 1.2.4 is intentionally unsigned; SignPath starts in 1.2.5.

### ไทย

- แยกโค้ดจุดเริ่มต้นขนาดใหญ่ของลันเชอร์ออกเป็นโมดูล UI, สถานะ, Minecraft,
  ไลบรารีคอนเทนต์, ไลบรารีสกิน, ระบบอัปเดต และแต่ละแพลตฟอร์ม
  โดยคงขอบเขตความปลอดภัยของ Electron ไว้
- เพิ่มไลบรารีสกินที่รองรับการค้นหา แท็ก แบ่งหน้า พรีวิว สกินที่บันทึกไว้
  การตรวจชนิดแขน ธีม และการลองโหลดหน้าแรกใหม่โดยอัตโนมัติ
- เพิ่มธีมตามอุปกรณ์ ธีมมืด และธีมสว่างแบบหม่น พร้อมคอนทราสต์ที่อ่านง่าย
  ไอคอนสม่ำเสมอ ปุ่มจัดการบัญชีที่มองเห็นชัด และเอฟเฟกต์เปลี่ยนธีมแบบนุ่มนวล
- ปรับการจัดการคอนเทนต์ของอินสแตนซ์ด้วยการแจ้ง Loader รุ่นใหม่
  ป้าย Stable/Unstable ที่แยกง่าย การเลือกเวอร์ชันมอดแบบเจาะจง
  และการดูแลมอดเสริม NamLauncher ที่ป้องกันการถอดผ่านลันเชอร์
- เพิ่มระบบอัปเดตลันเชอร์แบบ application bundle สำหรับการติดตั้ง Current User
  พร้อมตรวจ SHA-256 ยืนยันสุขภาพโปรเซสด้วยรหัสเฉพาะ ย้อนกลับอัตโนมัติเมื่อผิดปกติ
  และคงตัวติดตั้งเดิมเป็นทางสำรองที่ปลอดภัย
- รวมไฟล์ companion Stable ที่ตรึงความถูกต้องสำหรับ Fabric, Forge และ NeoForge
  รุ่นที่ยังดูแล ส่วนเป้าหมายรุ่นเก่ายังคงใช้ companion รุ่นเดิมที่รองรับ
- ลดข้อมูลอ่อนไหวในรายงานข้อผิดพลาด และส่งเฉพาะปัญหาที่ลันเชอร์ยืนยันแล้ว
  ผ่านบริการรายงานส่วนตัวที่ตั้งค่าไว้
- ทำให้การลากไฟล์เข้าอินสแตนซ์จบงานพร้อมแสดงความคืบหน้าทีละไฟล์และสถานะสำเร็จ
  โดยไม่ค้างหมุนหลังนำเข้าเสร็จ
- รักษาปุ่มย่อ ขยาย และปิดหน้าต่างให้มองเห็นได้เมื่อย่อความกว้างลันเชอร์
- เปลี่ยนการติดตั้งและอัปเดต Windows เป็นแบบ Current User พร้อมย้ายการติดตั้ง
  All Users รุ่นเก่าที่ตรวจสอบได้อย่างปลอดภัยและรักษาโฟลเดอร์ข้อมูลเดิม
- แสดงหัวสกินที่บันทึกไว้หรือหัวสกินเริ่มต้นอย่างถูกต้องใน Discord IPC
  สำหรับบัญชี Offline พร้อมชื่อผู้เล่น
- เผยแพร่แพ็กเกจ Windows, Linux และ macOS พร้อมไฟล์ SHA-256 และหลักฐานที่มาของ build
  โดย 1.2.4 ตั้งใจปล่อยแบบ unsigned และจะเริ่มใช้ SignPath ใน 1.2.5

Older release history remains available in the archived legacy repository.

## 1.2.3
## 1.2.3

date: 2026-09-13
status: stable
source: cleaned-public-launcher-baseline
commit: 8856af1483e3b5bfd3446007aaeeca13600ca785

### English

- Publishes the cleaned open-source launcher baseline for Windows, Linux, and macOS.
- Includes integrity-checked NamLauncher companion artifacts and guarded release packaging.
- Keeps private API, Discord, authentication, administration, deployment, and user data outside this repository.

### ไทย

- เผยแพร่โค้ดลันเชอร์แบบโอเพนซอร์สที่จัดระเบียบแล้วสำหรับ Windows, Linux และ macOS
- รวมไฟล์ Companion ที่ตรวจสอบความถูกต้องและขั้นตอนแพ็กรีลีสแบบมีจุดป้องกัน
- แยก API, Discord, การยืนยันตัวตน, ระบบแอดมิน, การติดตั้งระบบ และข้อมูลผู้ใช้ออกจากรีโปนี้
