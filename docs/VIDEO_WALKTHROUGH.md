# Fieldstock Walkthrough (3-5 minutes)

Suggested duration: about 4 minutes. Record the browser and narrate; use the demo accounts from `PROJECT_GUIDE.md`.

## 0:00-0:35 | Overview and architecture

Show the sign-in screen and explain that the React/Vite client calls a JWT-protected Express API backed by MongoDB. Mention that roles are enforced on the server, not just by hiding navigation. Point to the project folders and the activity ledger model.

## 0:35-1:15 | Dashboard

Sign in as Admin. Point out the base, date-period, and equipment filters; explain opening balance, closing balance, net movement, assignments, and expenditures. Click Net Movement and show the purchase, transfer-in, and transfer-out breakdown.

## 1:15-2:15 | Purchase and transfer

Record a small purchase and show it in Recent Activity. Open Transfers, choose a source and destination base, and record a transfer. Explain that it is stored once with both endpoints, then displayed as inbound/outbound movement for each base.

## 2:15-3:00 | Assignment, expenditure, and stock protection

Record a small assignment and an expenditure from the Assignments page. Show the changed available balance. Mention that insufficient stock is rejected and concurrent reductions are serialized with per-stock MongoDB locks.

## 3:00-3:40 | RBAC and audit

Sign out and sign in as Logistics Officer. Show that Assignments and the full audit view are unavailable, while Purchases and Transfers remain available. If time permits, sign in as Base Commander and show the base-scoped view. Finish on Activity Log and point out actor, timestamp, and reference fields.

## 3:40-4:00 | Setup and close

Show the setup section in `PROJECT_GUIDE.md`, mention the sample database dump, and close with the production caveat: rotate demo credentials and configure hosted MongoDB/JWT/CORS values before deployment.