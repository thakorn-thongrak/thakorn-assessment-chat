# LINE Webchat

โปรเจกต์นี้เป็นเว็บแอปพลิเคชันที่ทำหน้าที่เป็น "สะพาน" เชื่อมต่อระหว่างหน้าเว็บ (webchat) กับ LINE Official Account (LINE OA) โดยอาศัย LINE Messaging API เป็นตัวกลาง เป้าหมายคือให้ผู้ดูแล/แอดมินสามารถคุยกับผู้ใช้ที่แชทเข้ามาทาง LINE ได้ผ่านหน้าเว็บ โดยไม่ต้องเปิดแอป LINE เอง และในทางกลับกัน ข้อความที่พิมพ์จากหน้าเว็บก็จะถูกส่งเข้าไปหาผู้ใช้ใน LINE OA ได้จริงผ่าน Push Message API

ระบบถูกออกแบบให้ทำงานสองทิศทาง (bidirectional):

- **จากเว็บไปหา LINE** — แอดมินเลือกการสนทนาจาก sidebar แล้วพิมพ์ข้อความหรือเลือกสติกเกอร์ กดส่ง ระบบจะยิง request ไปยัง LINE Push Message API เพื่อส่งข้อความนั้นเข้าไปหา LINE userId ของคู่สนทนา
- **จาก LINE กลับมาที่เว็บ** — เมื่อผู้ใช้พิมพ์ข้อความ (หรือส่งสติกเกอร์) เข้ามาที่ LINE OA, LINE จะยิง webhook event มาที่ backend ของเรา ระบบจะตรวจสอบความถูกต้องของ request (verify signature) แล้วเก็บข้อความนั้นไว้ ฝั่งหน้าเว็บจะ polling (ดึงข้อมูลซ้ำเป็นช่วงๆ) ไปถามทุก ๆ 2.5 วินาทีว่ามีข้อความใหม่หรือไม่ แล้วนำมาแสดงเป็น chat bubble แบบเรียลไทม์

**ข้อจำกัดสำคัญของ LINE ที่ต้องเข้าใจก่อนใช้งาน:** LINE ไม่มี API ให้แปลง LINE ID (`@handle` ที่คนตั้งเอง) เป็น userId ได้ (ตั้งใจปิดกั้นเพื่อความเป็นส่วนตัว) วิธีเดียวที่ระบบจะรู้จัก userId ของใครสักคนคือ **ผู้ใช้ต้องเป็นฝ่ายแอดเพื่อนแล้วทักเข้ามาหา LINE OA ก่อนเสมอ** เว็บนี้จึงไม่มีช่องให้พิมพ์ userId เอง — พอมีคนทักเข้ามา ระบบจะเก็บ userId พร้อมดึงชื่อ/รูปโปรไฟล์จริงมาโชว์ใน sidebar ให้แอดมินกดเลือกคุยต่อได้ทันที

## การทำงานเบื้องหลัง (How it works)

เมื่อผู้ใช้ LINE พิมพ์ข้อความมาที่ LINE OA, LINE จะส่ง HTTP POST request มาที่ endpoint `/api/webhook` พร้อมแนบ header `x-line-signature` ซึ่งเป็นค่าที่เข้ารหัสด้วย channel secret ของเรา ระบบจะคำนวณ signature จาก raw body ของ request ด้วย HMAC-SHA256 แล้วเทียบกับค่าที่ LINE ส่งมา (ผ่าน `crypto.timingSafeEqual` เพื่อป้องกัน timing attack) หากไม่ตรงกันจะปฏิเสธ request ทันทีด้วย HTTP 401 เพื่อป้องกันไม่ให้มีใครปลอม request มายิง endpoint นี้ได้ เมื่อ signature ถูกต้อง ระบบจะแกะ event ออกมา (ข้อความตัวอักษรหรือสติกเกอร์) แล้วบันทึกลง Redis — **ไม่มีการตอบกลับอัตโนมัติใด ๆ ไปหาผู้ใช้** เพราะการตอบต้องมาจากแอดมินผ่านหน้าเว็บเท่านั้น

ฝั่งหน้าเว็บจะมี endpoint `/api/messages` ที่รับ query parameter เป็น `userId` (และ `after` สำหรับระบุว่าจะดึงเฉพาะข้อความที่มาใหม่กว่า id ที่ระบุ) หน้าเว็บจะเรียก endpoint นี้ซ้ำ ๆ ทุก 2.5 วินาทีเพื่อดึงข้อความใหม่มาต่อท้ายในหน้าจอแชท

> **ทำไมใช้ polling ไม่ใช่ WebSocket/SSE:** webhook เป็นการสื่อสารแบบ **server-to-server ทางเดียว** (LINE → server เรา) เขียนข้อมูลลง Redis เสร็จก็จบ request ไม่มีช่องทางส่งสัญญาณกลับไปหา browser ที่เปิดค้างอยู่ได้เลย การจะทำ real-time จริงต้องมี WebSocket หรือ Server-Sent Events (SSE) ซึ่งต้องมี connection ที่ค้างไว้ระหว่าง browser กับ server — แต่ route handler ของ Next.js ที่รันเป็น Vercel serverless function ถูกออกแบบมาให้ทำงานสั้น ๆ แล้วจบ ไม่เหมาะกับ connection ค้างนาน ๆ (ต้องพึ่ง Fluid Compute หรือ infra แยกต่างหากถึงจะทำได้ดี) **เลือกใช้ polling ทุก 2.5 วินาทีในโปรเจกต์นี้เพราะเร็วและง่ายต่อการ implement ภายในกรอบเวลาของ technical test** หน่วงสูงสุด 2.5 วิ ไม่ real-time เป๊ะ แต่ไม่ต้องพึ่ง infra เพิ่มเติมเลย **ถ้าจะเอาไปใช้งานจริง (production) แนะนำให้เปลี่ยนไปใช้ SSE ผูกกับ Redis pub/sub** (Upstash รองรับ) แทน จะได้ real-time จริงโดยไม่ต้องแบก WebSocket server แยก

เมื่อแอดมินฝั่งเว็บพิมพ์ข้อความ (หรือเลือกสติกเกอร์) แล้วกดส่ง หน้าเว็บจะยิง POST ไปที่ `/api/push` พร้อมกับ `userId` ปลายทางและ `content` (เนื้อหาข้อความ อาจเป็น `{type:"text",text}` หรือ `{type:"sticker",packageId,stickerId}`) ระบบฝั่ง backend จะเรียก LINE Push Message API เพื่อส่งไปหาผู้ใช้คนนั้นโดยตรง (ไม่ผ่าน reply token เพราะเป็นการส่งแบบ proactive ไม่ใช่การตอบกลับ event เดิม) หากส่งสำเร็จจะบันทึกไว้ในสถานะ "outgoing" เพื่อให้แสดงเป็น chat bubble ฝั่งขวาในหน้าเว็บด้วย

รองรับ **สติกเกอร์ LINE** ทั้งสองทิศทาง: ถ้า user ส่งสติกเกอร์มาทาง LINE, webhook จะเก็บ `packageId`/`stickerId` ไว้แล้วแสดงเป็นรูปสติกเกอร์ในหน้าเว็บ (ใช้ URL รูปแบบ `https://stickershop.line-scdn.net/stickershop/v1/sticker/{stickerId}/android/sticker.png` ที่ LINE เปิดให้เรียกได้สาธารณะสำหรับ sticker id ใดก็ได้) ส่วนฝั่งแอดมินมีปุ่มสติกเกอร์ (ไอคอนหน้ายิ้ม) ให้เลือกจากชุดสติกเกอร์ตัวอย่างส่งกลับไปหา user ได้เช่นกัน

แต่ละ bubble มีปุ่ม **"ลบ"** (โผล่ตอน hover) ให้ลบข้อความออกจาก `DELETE /api/messages` ได้ — **ลบได้แค่ฝั่ง webchat ของเราเท่านั้น ไม่กระทบข้อความในแอป LINE ของอีกฝั่งเลย** เพราะ LINE Messaging API ไม่มี endpoint ให้ OA/bot สั่งเรียกคืน (unsend) ข้อความที่ตัวเองส่งไปแล้ว ("unsend" ของ LINE เป็นแค่ webhook event แจ้งเตือนเวลา *user* เรียกคืนข้อความของตัวเองในแอป ไม่ใช่ API สำหรับ bot) ปุ่มนี้จึงเหมาะกับกรณีอยากเคลียร์ประวัติที่พิมพ์ผิด/ไม่เกี่ยวข้องออกจากหน้าแอดมินเท่านั้น

## โครงสร้างโปรเจกต์และไฟล์สำคัญ

- `app/page.tsx` — หน้า UI หลักของ webchat เขียนด้วย React (client component) แบ่งเป็น sidebar แสดงรายชื่อ/รูปคนที่เคยทักเข้ามา (`ConversationList`, ดึงจาก `/api/conversations` ทุก 2.5 วินาที) กับพื้นที่แชทหลัก (`ChatSession`) ที่แสดงข้อความ/สติกเกอร์เป็น chat bubble แยกสีตามทิศทาง พร้อมช่อง input และปุ่มสติกเกอร์ `ChatSession` จะ mount ใหม่ทุกครั้งที่เปลี่ยน userId ที่เลือก เพื่อให้ state ของแต่ละบทสนทนาสะอาดและไม่ปนกัน
- `app/api/webhook/route.ts` — route handler รับ POST จาก LINE, verify signature, แกะ event (ข้อความหรือสติกเกอร์), บันทึกข้อความ, ดึงโปรไฟล์ผู้ส่งมาเก็บ (ถ้ายังไม่เคยเก็บ), และ reply กลับอัตโนมัติ
- `app/api/messages/route.ts` — route handler มี GET ให้หน้าเว็บ polling ดึงข้อความใหม่ตาม userId และ DELETE ให้ลบข้อความออกจาก store ของเรา (ไม่กระทบฝั่ง LINE)
- `app/api/push/route.ts` — route handler แบบ POST รับ `userId` + `content` (ข้อความหรือสติกเกอร์) จากหน้าเว็บแล้วส่งต่อไปยัง LINE Push API
- `app/api/conversations/route.ts` — route handler แบบ GET คืนรายชื่อการสนทนาทั้งหมด (userId, โปรไฟล์, ข้อความล่าสุด) เรียงตามเวลาล่าสุดก่อน ให้ sidebar ใช้แสดงผล
- `lib/line.ts` — รวมฟังก์ชัน helper สำหรับคุยกับ LINE: `verifySignature` (ตรวจสอบ webhook signature), `replyMessage`/`pushMessage` (ส่งข้อความหรือสติกเกอร์ผ่าน reply token หรือแบบ proactive), `getProfile` (ดึงชื่อ/รูปโปรไฟล์ผู้ใช้), และ `stickerImageUrl` (สร้าง URL รูปสติกเกอร์จาก sticker id) รวมถึง type definition ของ webhook event ที่ LINE ส่งมา
- `lib/store.ts` — ที่เก็บข้อความและโปรไฟล์ ต่อกับ Upstash Redis ผ่าน `@upstash/redis` (ดูรายละเอียดในหัวข้อถัดไป)

## เทคโนโลยีที่ใช้ (Tech stack)

โปรเจกต์นี้สร้างด้วย **Next.js 16** โดยใช้ App Router ซึ่งเป็นสถาปัตยกรรมล่าสุดของ Next.js ที่รวม routing, server components, และ API routes (route handlers) ไว้ในโครงสร้างเดียวกัน ทำให้สามารถเขียนทั้งฝั่ง frontend (หน้าเว็บ) และ backend (API endpoints สำหรับคุยกับ LINE) อยู่ในโปรเจกต์เดียวโดยไม่ต้องแยก server ต่างหาก เหมาะกับการ deploy ขึ้น Vercel ซึ่งรองรับ Next.js โดยตรงและสามารถรัน route handler เป็น serverless function ได้ทันที

ภาษาโปรแกรมที่ใช้คือ **TypeScript** ทั้งโปรเจกต์ เพื่อให้ได้ type safety ทั้งฝั่ง UI และ API รวมถึงกำหนด type ของ LINE webhook event และ message object อย่างชัดเจน ลดโอกาสเกิด bug จากการเข้าถึง field ที่ไม่มีอยู่จริงใน payload

ด้าน UI ใช้ **Tailwind CSS 4** ในการจัดสไตล์ทั้งหมด ออกแบบให้มีโทนสีเขียวคล้ายกับแอป LINE (emerald) เพื่อให้ผู้ใช้รู้สึกคุ้นเคย มี layout แบบ chat bubble ที่แยกฝั่งซ้าย-ขวาตามทิศทางข้อความ พร้อม timestamp และ responsive กับหน้าจอขนาดต่าง ๆ

การเชื่อมต่อกับ LINE ใช้ **LINE Messaging API** ผ่าน REST endpoint ของ LINE โดยตรง (ไม่ได้พึ่งพา SDK ภายนอก) ได้แก่ Push Message API (`/v2/bot/message/push`) สำหรับส่งข้อความแบบ proactive และ Reply Message API (`/v2/bot/message/reply`) สำหรับตอบกลับ event ที่มาจาก webhook การตรวจสอบความถูกต้องของ webhook request ใช้ Node.js built-in module `crypto` ในการคำนวณ HMAC-SHA256 signature

## เรื่องที่เก็บข้อความ (Upstash Redis)

`lib/store.ts` เดิมเก็บข้อความไว้ใน memory ของ process ด้วย `Map` ธรรมดา ซึ่งใช้ได้แค่ตอน dev/demo เพราะบน Vercel แต่ละ serverless invocation อาจไปตกคนละ instance กัน ทำให้ข้อความหายไปมาระหว่าง request ได้ และข้อมูลทั้งหมดหายทันทีที่ redeploy — ปัญหานี้เกิดขึ้นจริงระหว่างพัฒนา (สังเกตได้ตอนทดสอบแล้ว conversation list ว่างเปล่าหลัง deploy ใหม่)

ตอนนี้ย้ายไปใช้ **Upstash for Redis** แล้ว (ติดตั้งผ่าน Vercel Marketplace integration, แผนฟรี ไม่มีค่าใช้จ่าย) ซึ่งเป็น managed Redis ที่อยู่นอก process การเก็บข้อมูลจึงถาวรและใช้ร่วมกันได้ทุก instance/region/deployment โครงสร้างข้อมูลใน Redis:

- `messages:{userId}` — Redis list เก็บ `ChatMessage` เรียงเก่า→ใหม่ (ใช้ `RPUSH`/`LRANGE`)
- `conversations` — Redis sorted set เก็บ userId ทั้งหมด คะแนน (score) คือเวลาข้อความล่าสุด (ใช้ `ZADD`/`ZRANGE ... REV` เพื่อโชว์คนคุยล่าสุดก่อน)
- `profile:{userId}` — โปรไฟล์ (ชื่อ/รูป) ของแต่ละ userId ที่ cache ไว้
- `message:next_id` — ตัวนับ (ใช้ `INCR`) สำหรับสร้าง id ข้อความที่ไม่ซ้ำกันทั่วทั้งระบบ

เชื่อมต่อผ่าน `@upstash/redis` SDK (`Redis.fromEnv()`) ซึ่งอ่าน env var `KV_REST_API_URL`/`KV_REST_API_TOKEN` ที่ integration ตั้งให้อัตโนมัติทั้ง Production, Preview, และ Development — ไม่ต้องตั้งค่าเพิ่มเอง ฟังก์ชันทุกตัวใน `lib/store.ts` เป็น `async` แล้ว (เดิม synchronous) เพราะเรียก Redis ผ่าน REST API

## Environment variables

โปรเจกต์ต้องการตัวแปรสภาพแวดล้อมที่ต้องตั้งเอง 3 ตัว (ดูตัวอย่างได้ที่ `.env.local.example`):

- `LINE_CHANNEL_SECRET` — จาก LINE Developers Console, ใช้ตรวจสอบ signature ของ webhook request ว่ามาจาก LINE จริง
- `LINE_CHANNEL_ACCESS_TOKEN` — จาก LINE Developers Console, ใช้เป็น token สำหรับยืนยันตัวตนตอนเรียก Push/Reply Message API
- `NEXT_PUBLIC_LINE_OA_ID` — Basic ID (`@handle`) ของ LINE OA นี้ เช่น `@831ltgzv` เป็นข้อมูลสาธารณะไม่ใช่ความลับ (ขึ้นต้นด้วย `NEXT_PUBLIC_` เพราะต้อง bundle ไปฝั่ง client เพื่อโชว์เป็นลิงก์/ข้อมูลแอดเพื่อนในหน้าเว็บได้)

นอกจากนี้ยังมีตัวแปรของ Upstash Redis (`KV_REST_API_URL`, `KV_REST_API_TOKEN` ฯลฯ) ที่ Vercel Marketplace integration ตั้งให้อัตโนมัติตอนติดตั้ง — **ไม่ต้องตั้งเอง** แต่ถ้ารันในเครื่อง local ต้องดึงมาด้วย `vercel env pull .env.local` (หลัง `vercel link` โปรเจกต์แล้ว) ไม่งั้น `lib/store.ts` จะต่อ Redis ไม่ได้

## การติดตั้งและรันในเครื่อง

```bash
npm install
cp .env.local.example .env.local
```

จากนั้นแก้ไฟล์ `.env.local` ใส่ค่า `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` และ `NEXT_PUBLIC_LINE_OA_ID` ที่ได้จาก LINE Developers Console (ดูวิธีขอค่าเหล่านี้ในหัวข้อ "Setup LINE Developers Console" ด้านล่าง)

ถ้าโปรเจกต์เชื่อม Vercel ไว้แล้ว (`vercel link`) ให้ดึงตัวแปร Redis (`KV_REST_API_URL` ฯลฯ) มาต่อท้าย `.env.local` ด้วยคำสั่งนี้ (ระวัง: คำสั่งนี้จะ**เขียนทับ** `.env.local` ทั้งไฟล์ ให้สำรอง `LINE_CHANNEL_SECRET`/`LINE_CHANNEL_ACCESS_TOKEN` ไว้ก่อนแล้วใส่กลับเข้าไปหลังรัน):

```bash
vercel env pull .env.local
```

แล้วรัน dev server:

```bash
npm run dev
```

เปิดเบราว์เซอร์ไปที่ http://localhost:3000

หากต้องการทดสอบ webhook จากเครื่อง local จำเป็นต้อง expose `localhost:3000` ออกสู่อินเทอร์เน็ตก่อน (เช่นผ่าน ngrok) แล้วนำ URL ที่ได้ (เช่น `https://xxxx.ngrok-free.app/api/webhook`) ไปตั้งเป็น Webhook URL ใน LINE Developers Console ชั่วคราวระหว่างพัฒนา

## Setup LINE Developers Console

1. ไปที่ https://developers.line.biz/console/ แล้วล็อกอินด้วยบัญชี LINE
2. สร้าง Provider ใหม่ (หากยังไม่มี) โดยตั้งชื่ออะไรก็ได้ เช่น "Thakorn Assessment"
3. ในหน้า Provider กด "Create a new channel" แล้วเลือกประเภท "Messaging API"
4. กรอกข้อมูลช่อง (channel icon, ชื่อ, หมวดหมู่ ฯลฯ) แล้วกดสร้าง
5. เข้าไปที่ช่องที่สร้างขึ้น ไปที่แท็บ "Basic settings" แล้วคัดลอกค่า Channel secret เพื่อนำไปใช้เป็น `LINE_CHANNEL_SECRET`
6. ไปที่แท็บ "Messaging API" เลื่อนลงมาที่ Channel access token แล้วกด Issue เพื่อออก long-lived token นำค่าที่ได้ไปใช้เป็น `LINE_CHANNEL_ACCESS_TOKEN` จากนั้นปิด Auto-reply messages และ Greeting messages ในเมนู LINE Official Account Manager > Response settings เพื่อไม่ให้ระบบตอบกลับอัตโนมัติของ LINE มาชนกับ webhook ของเรา แล้วเปิด Use webhook เป็น ON (ยังไม่ต้องใส่ Webhook URL ในขั้นตอนนี้ จะกลับมาใส่หลัง deploy เสร็จ)
7. ในหน้า Messaging API tab เดียวกัน จะเห็น **Basic ID** ของ OA (เช่น `@831ltgzv`) และ QR code — คัดลอก Basic ID ไปใช้เป็น `NEXT_PUBLIC_LINE_OA_ID`
8. ทดสอบระบบโดยแอดเพื่อน LINE OA นี้เอง (สแกน QR code หรือค้นหา Basic ID ในแอป LINE) แล้วส่งข้อความทักไปหาสักครั้ง — คนอื่นก็ต้องแอดเพื่อนแล้วทักมาก่อนเหมือนกันถึงจะเริ่มแชทกับเว็บนี้ได้ เพราะ LINE ไม่อนุญาตให้ third-party ส่งข้อความหาใครก่อนโดยที่เขายังไม่เคยแอด/ทักมา พอทักมาแล้ว ระบบจะรู้จัก userId อัตโนมัติและโชว์ชื่อในหน้าเว็บให้เลย ไม่ต้องไปหา userId มากรอกเอง

## Deploy ขึ้น Vercel

1. Push โค้ดขึ้น GitHub ก่อน (ดูขั้นตอนในหัวข้อถัดไป)
2. ไปที่ https://vercel.com แล้วล็อกอินด้วยบัญชี GitHub
3. กด "Add New... > Project" แล้วเลือก repository ของโปรเจกต์นี้
4. ในหน้า Configure Project ระบบจะตรวจจับ Framework Preset เป็น Next.js โดยอัตโนมัติ ให้เปิดส่วน Environment Variables แล้วเพิ่มค่า `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` และ `NEXT_PUBLIC_LINE_OA_ID` ตามค่าที่ได้จาก LINE console
5. กด Deploy แล้วรอจน build เสร็จ จะได้ URL รูปแบบ `https://your-project.vercel.app`
6. กลับไปที่ LINE Developers Console > Messaging API > Webhook settings แล้วใส่ Webhook URL เป็น `https://your-project.vercel.app/api/webhook` กด Verify เพื่อตรวจสอบว่า endpoint ตอบกลับ 200 ถูกต้อง และตรวจสอบให้แน่ใจว่า Use webhook เปิดเป็น ON
7. เปิดเว็บที่ deploy แล้ว แอดเพื่อน LINE OA (ผ่าน Basic ID หรือ QR code) แล้วลองทักไปหาสักครั้ง — ชื่อของคุณควรโผล่ใน sidebar ของเว็บให้กดเข้าไปคุยต่อได้ ข้อความ/สติกเกอร์ควรวิ่งไปมาระหว่างเว็บและ LINE ได้ทั้งสองทาง

## Push ขึ้น GitHub (public repository)

```bash
git add -A
git commit -m "Initial commit: LINE webchat"
```

สร้าง repository บน GitHub ผ่าน GitHub CLI:

```bash
gh repo create thakorn-assessment-chat --public --source=. --remote=origin --push
```

หรือหากไม่ได้ใช้ GitHub CLI ให้สร้าง repository เปล่าบน https://github.com/new (ตั้งค่าเป็น Public) แล้วรันคำสั่งต่อไปนี้แทน:

```bash
git remote add origin https://github.com/<your-username>/thakorn-assessment-chat.git
git branch -M main
git push -u origin main
```
