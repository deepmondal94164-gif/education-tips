# Education Tips — Login + ₹2 / 30 Days + Protected PDFs

## 1. Install
Install Node.js 18+.

```bash
npm install
```

Copy `.env.example` to `.env` and add your Razorpay test/live credentials.

## 2. Add Razorpay checkout
In `public/index.html`, before `app.js`, add:

```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

## 3. Start
```bash
npm start
```

Open `http://localhost:3000`.

## 4. Admin
Create a normal user first. To make that user admin, run:

```sql
UPDATE users SET is_admin=1 WHERE email='your-email@example.com';
```

Then use the `/api/admin/upload` endpoint with a multipart form field named `pdf`, plus `title` and optional `description`.

## Important
The payment verification endpoint verifies the Razorpay signature before activating the 30-day subscription. Keep your Razorpay secret only on the server and never expose it in frontend code.

For production, also use HTTPS, secure cookies, rate limiting, CSRF protection where applicable, strict file-type/size validation, backups, and a proper admin UI.
