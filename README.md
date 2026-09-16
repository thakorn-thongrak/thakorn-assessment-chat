# LINE Webchat

เว็บแชทที่เชื่อมกับ LINE Official Account — แอดมินคุยกับ user ที่ทักเข้ามาทาง LINE ได้ผ่านหน้าเว็บ ส่งข้อความ/สติกเกอร์ได้ทั้งสองทาง

**หลักการสำคัญ:** LINE ไม่มีทางแปลง LINE ID (`@handle`) เป็น userId ได้ ดังนั้น **user ต้องแอดเพื่อนแล้วทักเข้ามาก่อนเสมอ** ระบบถึงจะรู้จักและโชว์ชื่อให้แอดมินกดเลือกคุยได้ (ไม่มีช่องกรอก userId เอง)

## Tech stack

Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Upstash Redis (เก็บข้อความ) + LINE Messaging API

## การทำงาน

- **LINE → เว็บ**: user ทักมา → LINE ยิง webhook (`/api/webhook`, verify signature) → เก็บลง Redis → เว็บ **polling** ทุก 2.5 วิ ผ่าน `/api/messages` และ `/api/conversations`
- **เว็บ → LINE**: แอดมินพิมพ์/เลือกสติกเกอร์ → `/api/push` → LINE Push API
- ใช้ polling แทน WebSocket/SSE เพราะเร็ว/ง่ายกว่าในกรอบเวลา assessment (webhook เป็น server-to-server ทางเดียว ส่งข้อมูลกลับ browser ที่เปิดค้างไม่ได้โดยตรง) ถ้าทำจริงควรอัปเกรดเป็น SSE + Redis pub/sub
- ปุ่ม "ลบ" บนแต่ละข้อความ ลบได้แค่ฝั่งเว็บเรา **ไม่กระทบข้อความในแอป LINE ของ user** (LINE ไม่มี API ให้ OA เรียกคืนข้อความที่ส่งไปแล้ว)

## Environment variables

ดูตัวอย่างที่ `.env.local.example`:

- `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` — จาก LINE Developers Console
- `NEXT_PUBLIC_LINE_OA_ID` — Basic ID ของ OA เช่น `@831ltgzv`
- ตัวแปร Redis (`KV_REST_API_URL` ฯลฯ) — Vercel ตั้งให้อัตโนมัติตอนติดตั้ง Upstash integration ไม่ต้องตั้งเอง (local ดึงด้วย `vercel env pull .env.local`)

## รันในเครื่อง

```bash
npm install
cp .env.local.example .env.local   # ใส่ค่า LINE ให้ครบ
npm run dev
```

เปิด http://localhost:3000 — ถ้าจะทดสอบ webhook จาก local ต้อง expose ผ่าน ngrok ก่อน

## API ทั้ง 5 เส้น

| Endpoint | ใครเรียก / ตอนไหน | ทำอะไร |
|---|---|---|
| `POST /api/webhook` | LINE เรียกมาเอง ทุกครั้งที่ user ทัก/ส่งสติกเกอร์เข้า OA | verify signature, เก็บข้อความลง Redis, ดึงโปรไฟล์ผู้ส่ง (ถ้ายังไม่เคยเก็บ) |
| `GET /api/messages` | เว็บ polling ทุก 2.5 วิ ตอนเปิดห้องแชท | ดึงข้อความในห้องนั้น (ใช้ `after` กันดึงซ้ำ) |
| `DELETE /api/messages` | เว็บเรียกตอนกดปุ่ม "ลบ" บน bubble | ลบข้อความออกจาก Redis ฝั่งเราเท่านั้น |
| `POST /api/push` | เว็บเรียกตอนแอดมินกดส่งข้อความ/สติกเกอร์ | ยิงไป LINE Push API แล้วบันทึกเป็น outgoing |
| `GET /api/conversations` | เว็บ polling ทุก 2.5 วิ ตลอดเวลาที่เปิดหน้าเว็บ | คืนรายชื่อ/รูป/ข้อความล่าสุดของทุกคนที่เคยทักมา ให้ sidebar โชว์ |
| `GET /api/bot-info` | เว็บเรียกครั้งเดียวตอนโหลดหน้า | ดึงชื่อ/รูปโปรไฟล์จริงของ OA มาโชว์ที่ header |

## Push ขึ้น GitHub

```bash
git add -A && git commit -m "..."
gh repo create <repo-name> --public --source=. --remote=origin --push
```
