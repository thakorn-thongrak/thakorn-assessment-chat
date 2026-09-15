# LINE Webchat

โปรเจกต์นี้เป็นเว็บแอปพลิเคชันที่ทำหน้าที่เป็น "สะพาน" เชื่อมต่อระหว่างหน้าเว็บ (webchat) กับ LINE Official Account (LINE OA) โดยอาศัย LINE Messaging API เป็นตัวกลาง เป้าหมายคือให้ผู้ดูแล/แอดมินสามารถคุยกับผู้ใช้ที่แชทเข้ามาทาง LINE ได้ผ่านหน้าเว็บ โดยไม่ต้องเปิดแอป LINE เอง และในทางกลับกัน ข้อความที่พิมพ์จากหน้าเว็บก็จะถูกส่งเข้าไปหาผู้ใช้ใน LINE OA ได้จริงผ่าน Push Message API

ระบบถูกออกแบบให้ทำงานสองทิศทาง (bidirectional):

- **จากเว็บไปหา LINE** — ผู้ใช้พิมพ์ข้อความในหน้าเว็บ กดส่ง ระบบจะยิง request ไปยัง LINE Push Message API เพื่อส่งข้อความนั้นเข้าไปหา LINE userId ที่ระบุไว้
- **จาก LINE กลับมาที่เว็บ** — เมื่อผู้ใช้พิมพ์ข้อความเข้ามาที่ LINE OA, LINE จะยิง webhook event มาที่ backend ของเรา ระบบจะตรวจสอบความถูกต้องของ request (verify signature) แล้วเก็บข้อความนั้นไว้ ฝั่งหน้าเว็บจะ polling (ดึงข้อมูลซ้ำเป็นช่วงๆ) ไปถามทุก ๆ 2.5 วินาทีว่ามีข้อความใหม่หรือไม่ แล้วนำมาแสดงเป็น chat bubble แบบเรียลไทม์

## การทำงานเบื้องหลัง (How it works)

เมื่อผู้ใช้ LINE พิมพ์ข้อความมาที่ LINE OA, LINE จะส่ง HTTP POST request มาที่ endpoint `/api/webhook` พร้อมแนบ header `x-line-signature` ซึ่งเป็นค่าที่เข้ารหัสด้วย channel secret ของเรา ระบบจะคำนวณ signature จาก raw body ของ request ด้วย HMAC-SHA256 แล้วเทียบกับค่าที่ LINE ส่งมา (ผ่าน `crypto.timingSafeEqual` เพื่อป้องกัน timing attack) หากไม่ตรงกันจะปฏิเสธ request ทันทีด้วย HTTP 401 เพื่อป้องกันไม่ให้มีใครปลอม request มายิง endpoint นี้ได้ เมื่อ signature ถูกต้อง ระบบจะแกะ event ออกมา หากเป็นข้อความตัวอักษร (text message) จะบันทึกลง in-memory store พร้อมทั้งตอบกลับผู้ใช้อัตโนมัติผ่าน LINE Reply API เพื่อยืนยันว่าได้รับข้อความแล้ว

ฝั่งหน้าเว็บจะมี endpoint `/api/messages` ที่รับ query parameter เป็น `userId` (และ `after` สำหรับระบุว่าจะดึงเฉพาะข้อความที่มาใหม่กว่า id ที่ระบุ) หน้าเว็บจะเรียก endpoint นี้ซ้ำ ๆ ทุก 2.5 วินาทีเพื่อดึงข้อความใหม่มาต่อท้ายในหน้าจอแชท เป็นการจำลองพฤติกรรมเรียลไทม์แบบง่าย ๆ โดยไม่ต้องใช้ WebSocket หรือ Server-Sent Events

เมื่อผู้ใช้ฝั่งเว็บพิมพ์ข้อความแล้วกดส่ง หน้าเว็บจะยิง POST ไปที่ `/api/push` พร้อมกับ `userId` ปลายทางและข้อความ ระบบฝั่ง backend จะเรียก LINE Push Message API เพื่อส่งข้อความไปหาผู้ใช้คนนั้นโดยตรง (ไม่ผ่าน reply token เพราะเป็นการส่งแบบ proactive ไม่ใช่การตอบกลับ event เดิม) หากส่งสำเร็จจะบันทึกข้อความนั้นไว้ในสถานะ "outgoing" เพื่อให้แสดงเป็น chat bubble ฝั่งขวาในหน้าเว็บด้วย

## โครงสร้างโปรเจกต์และไฟล์สำคัญ

- `app/page.tsx` — หน้า UI หลักของ webchat เขียนด้วย React (client component) มีช่องกรอก LINE userId ที่จะคุยด้วย, พื้นที่แสดงข้อความแบบ chat bubble แยกสีตามทิศทาง (เขียวสำหรับข้อความที่ส่งออก, ขาวสำหรับข้อความที่รับเข้ามา), และช่อง input พร้อมปุ่มส่งข้อความ ส่วนของ session แชท (polling, ส่งข้อความ) ถูกแยกออกเป็น component ย่อย `ChatSession` ที่ mount ใหม่ทุกครั้งที่ userId เปลี่ยน เพื่อให้ state ของแต่ละบทสนทนาสะอาดและไม่ปนกัน
- `app/api/webhook/route.ts` — route handler รับ POST จาก LINE, verify signature, แกะ event, บันทึกข้อความ, และ reply กลับอัตโนมัติ
- `app/api/messages/route.ts` — route handler แบบ GET ให้หน้าเว็บ polling ดึงข้อความใหม่ตาม userId
- `app/api/push/route.ts` — route handler แบบ POST รับข้อความจากหน้าเว็บแล้วส่งต่อไปยัง LINE Push API
- `lib/line.ts` — รวมฟังก์ชัน helper สำหรับคุยกับ LINE: `verifySignature` (ตรวจสอบ webhook signature), `replyMessage` (ตอบกลับด้วย reply token), และ `pushMessage` (ส่งข้อความแบบ proactive ไปหา userId ที่ระบุ) รวมถึง type definition ของ webhook event ที่ LINE ส่งมา
- `lib/store.ts` — ที่เก็บข้อความแบบ in-memory (ดูรายละเอียดและข้อควรระวังในหัวข้อถัดไป)

## เทคโนโลยีที่ใช้ (Tech stack)

โปรเจกต์นี้สร้างด้วย **Next.js 16** โดยใช้ App Router ซึ่งเป็นสถาปัตยกรรมล่าสุดของ Next.js ที่รวม routing, server components, และ API routes (route handlers) ไว้ในโครงสร้างเดียวกัน ทำให้สามารถเขียนทั้งฝั่ง frontend (หน้าเว็บ) และ backend (API endpoints สำหรับคุยกับ LINE) อยู่ในโปรเจกต์เดียวโดยไม่ต้องแยก server ต่างหาก เหมาะกับการ deploy ขึ้น Vercel ซึ่งรองรับ Next.js โดยตรงและสามารถรัน route handler เป็น serverless function ได้ทันที

ภาษาโปรแกรมที่ใช้คือ **TypeScript** ทั้งโปรเจกต์ เพื่อให้ได้ type safety ทั้งฝั่ง UI และ API รวมถึงกำหนด type ของ LINE webhook event และ message object อย่างชัดเจน ลดโอกาสเกิด bug จากการเข้าถึง field ที่ไม่มีอยู่จริงใน payload

ด้าน UI ใช้ **Tailwind CSS 4** ในการจัดสไตล์ทั้งหมด ออกแบบให้มีโทนสีเขียวคล้ายกับแอป LINE (emerald) เพื่อให้ผู้ใช้รู้สึกคุ้นเคย มี layout แบบ chat bubble ที่แยกฝั่งซ้าย-ขวาตามทิศทางข้อความ พร้อม timestamp และ responsive กับหน้าจอขนาดต่าง ๆ

การเชื่อมต่อกับ LINE ใช้ **LINE Messaging API** ผ่าน REST endpoint ของ LINE โดยตรง (ไม่ได้พึ่งพา SDK ภายนอก) ได้แก่ Push Message API (`/v2/bot/message/push`) สำหรับส่งข้อความแบบ proactive และ Reply Message API (`/v2/bot/message/reply`) สำหรับตอบกลับ event ที่มาจาก webhook การตรวจสอบความถูกต้องของ webhook request ใช้ Node.js built-in module `crypto` ในการคำนวณ HMAC-SHA256 signature

## หมายเหตุเรื่อง in-memory store

`lib/store.ts` เก็บข้อความไว้ใน memory ของ process โดยใช้ `Map` ธรรมดา ซึ่งเหมาะสำหรับ development และ demo เท่านั้น ไม่เหมาะกับการใช้งานจริงในระยะยาว เพราะเมื่อ deploy ขึ้น Vercel แต่ละ serverless function invocation อาจไปทำงานบนคนละ instance กัน ทำให้ข้อความที่ webhook เก็บไว้ในหนึ่ง instance อาจไม่ถูกมองเห็นจาก request polling ที่ไปตกที่อีก instance หนึ่ง (โดยเฉพาะเมื่อมี traffic สูงหรือเกิด cold start) และข้อมูลทั้งหมดจะหายทันทีที่ instance ถูก recycle หรือ redeploy

เมื่อโปรเจกต์นี้จะถูกนำไปใช้งานจริง (production) หรือมีผู้ใช้มากกว่าหนึ่งคนใช้งานพร้อมกัน หรือมี traffic เริ่มสูงขึ้น ควรย้ายไปใช้ [Vercel KV](https://vercel.com/docs/storage/vercel-kv) (ซึ่งเป็น Upstash Redis ที่ผูกกับ Vercel) แทน โดยวิธีการย้ายคือติดตั้ง Vercel KV integration ในโปรเจกต์ แล้วแก้ฟังก์ชัน `addMessage`/`getMessages` ใน `lib/store.ts` ให้เรียก `kv.rpush(userId, ...)` และ `kv.lrange(userId, ...)` แทนการใช้ `Map` ในหน่วยความจำ เนื่องจากได้ออกแบบ signature ของฟังก์ชันไว้ให้คงที่ตั้งแต่แรก การย้ายจึงไม่ต้องแก้ route handler อื่นที่เรียกใช้งานอยู่เลย

## Environment variables

โปรเจกต์ต้องการตัวแปรสภาพแวดล้อมสองตัวจาก LINE Developers Console:

- `LINE_CHANNEL_SECRET` — ใช้ตรวจสอบ signature ของ webhook request ว่ามาจาก LINE จริง
- `LINE_CHANNEL_ACCESS_TOKEN` — ใช้เป็น token สำหรับยืนยันตัวตนตอนเรียก Push/Reply Message API

ดูตัวอย่างได้ที่ `.env.local.example`

## การติดตั้งและรันในเครื่อง

```bash
npm install
cp .env.local.example .env.local
```

จากนั้นแก้ไฟล์ `.env.local` ใส่ค่า `LINE_CHANNEL_SECRET` และ `LINE_CHANNEL_ACCESS_TOKEN` ที่ได้จาก LINE Developers Console (ดูวิธีขอค่าเหล่านี้ในหัวข้อ "Setup LINE Developers Console" ด้านล่าง) แล้วรัน dev server:

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
7. หา LINE userId ของตัวเองโดยเพิ่มเพื่อน LINE OA นี้ผ่าน QR code ที่อยู่ในหน้า Messaging API แล้วส่งข้อความทักไปหาสักครั้ง วิธีนี้จะทำให้ webhook ได้รับ event ที่มี `event.source.userId` ของเรา ซึ่งใช้กรอกในช่อง "LINE userId" ของหน้าเว็บได้

## Deploy ขึ้น Vercel

1. Push โค้ดขึ้น GitHub ก่อน (ดูขั้นตอนในหัวข้อถัดไป)
2. ไปที่ https://vercel.com แล้วล็อกอินด้วยบัญชี GitHub
3. กด "Add New... > Project" แล้วเลือก repository ของโปรเจกต์นี้
4. ในหน้า Configure Project ระบบจะตรวจจับ Framework Preset เป็น Next.js โดยอัตโนมัติ ให้เปิดส่วน Environment Variables แล้วเพิ่มค่า `LINE_CHANNEL_SECRET` และ `LINE_CHANNEL_ACCESS_TOKEN` ตามค่าที่ได้จาก LINE console
5. กด Deploy แล้วรอจน build เสร็จ จะได้ URL รูปแบบ `https://your-project.vercel.app`
6. กลับไปที่ LINE Developers Console > Messaging API > Webhook settings แล้วใส่ Webhook URL เป็น `https://your-project.vercel.app/api/webhook` กด Verify เพื่อตรวจสอบว่า endpoint ตอบกลับ 200 ถูกต้อง และตรวจสอบให้แน่ใจว่า Use webhook เปิดเป็น ON
7. เปิดเว็บที่ deploy แล้ว กรอก LINE userId ของตัวเอง แล้วลองพิมพ์คุยกับ LINE OA ข้อความควรวิ่งไปมาระหว่างเว็บและ LINE ได้ทั้งสองทาง

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
