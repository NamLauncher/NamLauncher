# NamLauncher Changelog

<!-- Author/creator: nattapat2871 (https://nattapat2871.me) -->

## 1.2.4
date: 2026-09-14
status: release-candidate
commit: e4dd58d46383c1e16c56f39f0a49833cf39b66cb

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

Older release history remains available in the archived legacy repository.
