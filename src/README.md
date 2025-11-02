# MMU Counseling Appointment System (CAS)

A comprehensive web-based counseling appointment system for Multimedia University (MMU) that facilitates student-counselor interactions through appointment scheduling, forum discussions, and real-time notifications.

## 🚀 Features

### Core Functionality
- **User Authentication & Authorization**
  - Role-based access (Student, Counselor, Admin)
  - Email verification system
  - Password reset functionality
  - Session management

- **Appointment Management**
  - Real-time availability scheduling
  - Automated counselor assignment
  - Appointment approval/decline workflow
  - Rescheduling capabilities
  - Email notifications for all appointment actions

- **Forum System**
  - Public/private post creation
  - Counselor-student interactions
  - Real-time replies and notifications
  - Post management (close, delete, toggle visibility)

- **Notification System**
  - In-app notifications
  - Browser push notifications
  - Email integration via EmailJS
  - Real-time updates

### User Roles

#### Students
- Book appointments with available counselors
- Create forum posts (public/private)
- View appointment history
- Receive notifications

#### Counselors
- Manage weekly availability schedules
- Handle appointment requests
- Respond to forum posts
- Emergency schedule adjustments
- View student appointments

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Firebase (Firestore, Authentication)
- **Email Service**: EmailJS
- **Hosting**: Firebase Hosting
- **Icons**: SVG-based icons from various sources

## 📁 Project Structure

```
mmu-cas/
├── authentication/
│   ├── login-page.html
│   ├── registration-page.html
│   ├── forgot-password.html
│   └── email-verification.html
├── student/
│   ├── student-dashboard.html
│   ├── student-meetings.html
│   └── student-forum.html
├── counselor/
│   ├── counselor-dashboard.html
│   ├── counselor-meetings.html
│   └── counselor-forum.html
├── shared/
│   ├── forum4.html
│   ├── notification.html
│   └── styles/
├── firebase/
│   └── configuration.js
└── assets/
    └── images/
```

## 🔧 Firebase Configuration

The system uses Firebase with the following services:
- **Authentication**: User management and session handling
- **Firestore**: Real-time database for appointments, forum posts, notifications
- **Storage**: File storage (if needed for future features)

### Key Collections
- `users` - User profiles and roles
- `appointments` - Booking and scheduling data
- `forumPosts` - Discussion threads and replies
- `notifications` - User notifications
- `counselorAvailability` - Counselor schedule management

## 🎨 UI/UX Features

- Responsive design for all device sizes
- Modern, accessible interface
- Real-time updates without page refresh
- Intuitive navigation and user flows
- Consistent branding with MMU colors

## 📧 Email Integration

The system integrates with EmailJS for:
- Appointment confirmations and updates
- Password reset links
- Email verification
- Forum notifications
- Counselor assignment notifications

## 🔒 Security Features

- Role-based access control
- Email verification requirement
- Secure session management
- Input validation and sanitization
- Firebase Security Rules implementation

## 🚀 Getting Started

### Prerequisites
- Firebase project with Authentication and Firestore enabled
- EmailJS account for email services
- Modern web browser with JavaScript enabled

### Installation
1. Clone the repository
2. Configure Firebase credentials in `firebase-config.js`
3. Set up EmailJS templates and credentials
4. Deploy to Firebase Hosting or preferred web server

### Firebase Setup
1. Enable Email/Password authentication
2. Configure Firestore security rules
3. Set up appropriate collections and indexes
4. Configure authorized domains for OAuth

## 📱 Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 🤝 Contributing

Please read the contributing guidelines before submitting pull requests or issues.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For technical support or questions about the system, please contact the MMU IT department or refer to the system documentation.

---

**Note**: This system is designed specifically for Multimedia University's counseling department and follows their operational workflows and privacy requirements.
