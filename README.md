# Success Academy — Official Student & Admin Portal

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Vanilla JS](https://img.shields.io/badge/Stack-Vanilla%20ES6%20%2B%20Web%20Components-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Database](https://img.shields.io/badge/Backend-Supabase%20%2B%20PostgreSQL-3ECF8E.svg)](https://supabase.com)
[![Deployment](https://img.shields.io/badge/Deploy-Vercel-black.svg)](https://vercel.com)

A modern, high-performance web portal built for **Success Academy** to streamline student study logs, examination scheduling, automated grading, attendance tracking, and administrative operations.

Engineered with **vanilla HTML, modern CSS, and modular ES6+ JavaScript** leveraging native Web Components—delivering near-instant load times with zero heavy client framework overhead (no React, Vue, Angular, or jQuery dependencies).

---

## ✨ Features

### 👨‍🎓 Student Portal
- **Study Log Tracker**: Record daily study sessions with categorized subjects, durations, and status tracking.
- **Exams & Report Cards**: View upcoming exam schedules, recorded scores, percentage summaries, and subject-wise grades.
- **Student Profile**: Manage personal contact details, view class and branch assignments, and securely change account passwords.
- **Theme Customization**: Dedicated light and dark mode with persistent user preferences.

### 🛡️ Admin Command Center
- **Student Management**: Register, view, and edit student records; filter by branch, class, or status.
- **Bulk Data Operations**: Fast Excel bulk import and export for student rosters.
- **Examination Management**: Create exams, assign subjects and maximum marks, and configure grading schemes.
- **Grading Engine**: Multi-framework grade computation (CBSE, State Board, Percentage scales) with automated mark normalization.
- **Study Log Oversight**: Monitor and filter study logs across classes and academic branches.
- **Institutional Settings**: Manage academic years, branches, classes, and curriculum subjects dynamically.
- **Reports & Analytics**: Comprehensive analytics on academic trends, study hour distributions, and student participation.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Core** | HTML5, CSS3 (Design Tokens & CSS Variables), Modern ES6+ JavaScript |
| **Component Model** | Native Web Components (Custom Elements, Shadow DOM) |
| **Authentication** | Supabase Auth (JWT-based secure sessions) |
| **Database & Security** | PostgreSQL 15+ on Supabase with Row Level Security (RLS) policies |
| **Icons & Media** | SVG Icon System & Vector Assets |
| **Hosting & CI/CD** | Vercel Static Hosting (`vercel.json`) / Any static web server |

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended) or any static HTTP server.
- A free or paid account at [Supabase](https://supabase.com).

### 1. Clone the Repository
```bash
git clone https://github.com/Mohdnabeelsid/successacademy.git
cd successacademy
```

### 2. Configure Supabase Credentials
1. Create a new project in your [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to **Project Settings → API** and copy:
   - **Project URL**
   - **anon / public key**
3. Update [`js/config/supabase-config.js`](js/config/supabase-config.js):
   ```javascript
   export const SUPABASE_URL = "https://<YOUR-PROJECT-ID>.supabase.co";
   export const SUPABASE_ANON_KEY = "<YOUR-ANON-PUBLIC-KEY>";
   ```

### 3. Initialize Database Schema & RLS Policies
1. In the Supabase Dashboard, open **SQL Editor** → **New Query**.
2. Copy and paste the full contents of [`schema.sql`](schema.sql).
3. Click **Run** to set up:
   - Tables (`users`, `students`, `study_logs`, `exams`, `exam_marks`, `branches`, `classes`, `subjects`, `academic_years`)
   - Indexes and automated `updated_at` triggers
   - Fine-grained Row Level Security (RLS) ensuring strict data segregation between students and administrators.

### 4. Create the Initial Administrator Account
1. In your Supabase Dashboard, navigate to **Authentication → Users** → click **Add user**:
   - **Email**: `admin@yourinstitution.com`
   - **Password**: *(Choose a strong administrator password)*
2. Copy the newly generated **User UID** for that user.
3. In the **SQL Editor**, execute the following query (replace `<ADMIN_USER_UID>` with the copied ID):
   ```sql
   INSERT INTO public.users (id, email, name, role, branch)
   VALUES ('<ADMIN_USER_UID>', 'admin@yourinstitution.com', 'System Administrator', 'admin', 'MAIN')
   ON CONFLICT (id) DO NOTHING;
   ```
4. Sign in to the portal at `pages/admin-login.html`.

### 5. Running Locally
Start a local static HTTP server from the root directory:
```bash
# Using npx http-server
npx http-server . -p 8080

# Or using Python 3
python -m http.server 8080
```
Open your browser at `http://localhost:8080`.

---

## ☁️ Deployment (Vercel)

This repository includes a [`vercel.json`](vercel.json) configured for static hosting.

### Option A: Via Vercel Dashboard (Recommended)
1. Push your code to your GitHub repository.
2. Import the repository in [Vercel](https://vercel.com/new).
3. Keep default build settings (Framework Preset: **Other**, Output Directory: `.`).
4. Click **Deploy**.

### Option B: Via Vercel CLI
```bash
npx vercel --prod
```

---

## 📁 Project Structure

```
successacademy/
├── assets/                       # Static graphics, academy branding, and logos
│   └── logo.png
├── css/                          # Modular styling architecture
│   ├── auth.css                  # Login and onboarding styles
│   ├── base.css                  # CSS reset, typography, and foundational layout
│   ├── components.css            # Buttons, modals, tables, and form inputs
│   ├── dashboard.css             # Main layout, metric cards, and responsive grids
│   ├── landing.css               # Public landing page styles
│   └── variables.css             # Design tokens (colors, spacing, elevation)
├── js/
│   ├── components/               # Reusable Web Components
│   │   ├── calendar.js           # Interactive calendar widget
│   │   ├── confirm-modal.js      # Modal dialog utility
│   │   ├── pagination.js         # Table pagination component
│   │   ├── sidebar.js            # Responsive navigation drawer
│   │   └── toast.js              # Notification alerts
│   ├── config/
│   │   └── supabase-config.js    # Client initialization & table mapping
│   ├── pages/                    # Page-specific controllers
│   │   ├── admin-exams.js        # Exam scheduling and marks entry
│   │   ├── student-exams.js      # Student exam views & report generation
│   │   └── student-study-logs.js # Study log entry & student history
│   ├── services/                 # Business logic and database access layer
│   │   ├── auth-service.js       # Session handling and credential management
│   │   ├── exam-service.js       # Exam CRUD & mark aggregation
│   │   ├── frame-service.js      # Academic frame & timetable management
│   │   ├── grading-service.js    # Grading rules & automated grade calculations
│   │   ├── report-service.js     # Data aggregation for charts and exports
│   │   ├── student-service.js    # Student registry & batch operations
│   │   ├── studylog-service.js   # Study log submissions & approvals
│   │   ├── subject-service.js    # Curriculum subject configuration
│   │   └── supabase-service.js   # Base Supabase queries and helpers
│   └── utils/                    # Shared helper utilities
│       ├── date-time.js          # Date formatting and timezone handlers
│       ├── exam-ui.js            # UI formatters for marks and badges
│       ├── theme.js              # Theme manager (Dark/Light mode)
│       ├── time-picker.js        # Accessible time-picker component
│       └── ui-helpers.js         # DOM manipulation and validation helpers
├── pages/                        # Application views
│   ├── admin-dashboard.html      # Administrator overview & quick actions
│   ├── admin-exams.html          # Exam management & grading console
│   ├── admin-login.html          # Administrator authentication
│   ├── reports.html              # Academic analytics & charts
│   ├── settings.html             # System parameters, branches & classes
│   ├── student-dashboard.html    # Student dashboard homepage
│   ├── student-exams.html        # Student exam schedules & report cards
│   ├── student-login.html        # Student sign-in portal
│   ├── student-management.html   # Student directory & Excel bulk tools
│   ├── student-profile.html      # Personal records & security settings
│   ├── student-study-logs.html   # Student personal study log interface
│   └── study-log-management.html # Admin study log review and audits
├── tests/                        # Automated unit and integration tests
│   ├── frame-service.test.js     # Frame service test suite
│   ├── grading-engine.test.js    # Grading logic and calculation tests
│   └── subject-service.test.js   # Subject configuration tests
├── index.html                    # Public academy portal landing page
├── schema.sql                    # Full PostgreSQL database schema & RLS rules
├── vercel.json                   # Vercel deployment configuration
└── LICENSE                       # MIT License
```

---

## 📑 Pages Overview

| Page | Path | Target Audience | Purpose |
|---|---|---|---|
| **Landing Page** | `index.html` | Public | Academy entrance, overview, and quick links |
| **Admin Login** | `pages/admin-login.html` | Staff | Email/Password login for administrators |
| **Admin Dashboard** | `pages/admin-dashboard.html` | Admin | Real-time statistics, metrics, and activity feeds |
| **Student Management** | `pages/student-management.html` | Admin | Student registration, updates, and bulk Excel import/export |
| **Exam Management** | `pages/admin-exams.html` | Admin | Exam creation, marks entry, and automated grading |
| **Study Log Audits** | `pages/study-log-management.html` | Admin | Oversight and reporting on student study records |
| **Reports & Analytics** | `pages/reports.html` | Admin | Visual academic trends, subject performance, and charts |
| **System Settings** | `pages/settings.html` | Admin | Configuration of academic years, classes, and subjects |
| **Student Login** | `pages/student-login.html` | Students | Admission number-based secure sign-in |
| **Student Dashboard** | `pages/student-dashboard.html` | Students | Student progress, upcoming exams, and summary metrics |
| **Student Study Logs** | `pages/student-study-logs.html` | Students | Personal study session tracker and historical log |
| **Student Exams** | `pages/student-exams.html` | Students | Exam timetables, results, and grade breakdowns |
| **Student Profile** | `pages/student-profile.html` | Students | Personal account details, security, and password update |

---

## 🧪 Testing

The repository includes unit tests to ensure stability of calculation engines and core services.

Run tests using Node.js:
```bash
node tests/grading-engine.test.js
node tests/frame-service.test.js
node tests/subject-service.test.js
```

---

## 🔒 Security & Privacy

- **Row Level Security (RLS)**: Enforced directly at the PostgreSQL layer. Students can only query and mutate their own logs and profiles.
- **Admin Isolation**: Administrator functionality is strictly gated by role validation checks (`is_admin()` SQL security definer).
- **Environment & Keys**: The repository only contains public client identifiers. Database administrative service role keys must never be committed to source control.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
