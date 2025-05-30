# Proxmox VM Dashboard

A modern web dashboard for managing Proxmox VMs designed for gaming service customers. This application provides a secure, user-friendly interface for customers to start, stop, and monitor their assigned virtual machines without requiring SSH or VNC access.

## Features

- 🔐 **Secure Authentication** - JWT-based authentication with role-based access control
- 🖥️ **VM Management** - Start, stop, shutdown, and reboot VMs
- 📊 **Real-time Monitoring** - View VM status, CPU usage, memory consumption, and uptime
- 👥 **Multi-user Support** - Customers can only access their assigned VMs
- 🎮 **Gaming-focused** - Optimized for Windows 10 gaming VMs
- 📱 **Responsive Design** - Modern, mobile-friendly interface
- ⚡ **Real-time Updates** - Live status updates and notifications

## Architecture

- **Frontend**: React 18 with Tailwind CSS
- **Backend**: Node.js with Express
- **Authentication**: JWT tokens with bcrypt password hashing
- **Proxmox Integration**: Direct API communication with Proxmox VE
- **Security**: Rate limiting, CORS protection, and input validation

## Prerequisites

- Node.js 16+ and npm
- Proxmox VE cluster with API access
- VMs configured and running on Proxmox

## Quick Start (Windows)

For Windows users, we've provided convenient batch files for easy setup:

### Option 1: Complete Demo Setup
```batch
# Run this for a complete automated setup
demo.bat
```

### Option 2: Step-by-Step Setup
```batch
# 1. Install all dependencies
install.bat

# 2. Setup environment and generate password hashes
setup.bat

# 3. Start the application
start.bat

# 4. Stop the application when done
stop.bat
```

**Important**: After running `setup.bat`, edit `server\.env` with your Proxmox configuration before starting the application.

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd proxmox-vm-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Configure environment variables**
   ```bash
   cd server
   cp env.example .env
   ```

   Edit `.env` with your Proxmox configuration:
   ```env
   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRE=24h

   # Proxmox Configuration
   PROXMOX_HOST=https://your-proxmox-host:8006
   PROXMOX_USERNAME=your-proxmox-username@pam
   PROXMOX_PASSWORD=your-proxmox-password
   PROXMOX_NODE=your-proxmox-node-name

   # API Rate Limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100

   # CORS Configuration
   CORS_ORIGIN=http://localhost:3000
   ```

4. **Start the development servers**
   ```bash
   npm run dev
   ```

   This will start:
   - Backend API server on http://localhost:5000
   - Frontend React app on http://localhost:3000

## Usage

### Demo Credentials

The application comes with pre-configured demo users:

- **Customer**: `customer1` / `password123`
- **Admin**: `admin` / `admin123`

### Customer Features

- View assigned VMs with real-time status
- Start/stop/shutdown/reboot VMs
- Monitor VM resource usage
- View subscription and account information

### Admin Features

- Access to all VMs in the cluster
- Full VM management capabilities
- User management (via API)

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/validate` - Validate JWT token
- `POST /api/auth/register` - Register new user (admin)

### VM Management
- `GET /api/vm` - Get user's VMs
- `GET /api/vm/:vmid` - Get specific VM details
- `POST /api/vm/:vmid/start` - Start VM
- `POST /api/vm/:vmid/stop` - Force stop VM
- `POST /api/vm/:vmid/shutdown` - Graceful shutdown VM
- `POST /api/vm/:vmid/reboot` - Reboot VM

### User Management
- `GET /api/user/profile` - Get user profile
- `GET /api/user/dashboard` - Get dashboard statistics

## Security Features

- **JWT Authentication** - Secure token-based authentication
- **Role-based Access Control** - Users can only access assigned VMs
- **Rate Limiting** - Prevents API abuse
- **Input Validation** - Sanitizes all user inputs
- **CORS Protection** - Configurable cross-origin policies
- **Password Hashing** - bcrypt with salt rounds
- **No SSH/VNC Access** - Customers cannot directly access VMs

## Customization

### Adding New Users

Users are currently stored in `server/data/users.js`. In production, replace this with a proper database:

```javascript
const newUser = await createUser({
  username: 'customer3',
  email: 'customer3@example.com',
  password: 'securepassword',
  vmIds: [103, 104] // Assign specific VM IDs
});
```

### VM Assignment

Edit the `vmIds` array in the user object to assign specific VMs to customers:

```javascript
{
  id: 1,
  username: 'customer1',
  vmIds: [100, 101], // These VM IDs will be accessible to this user
  // ... other user properties
}
```

## Production Deployment

1. **Environment Setup**
   - Set `NODE_ENV=production`
   - Use strong JWT secrets
   - Configure proper CORS origins
   - Set up SSL/TLS certificates

2. **Database Migration**
   - Replace in-memory user storage with PostgreSQL/MySQL
   - Implement proper user management
   - Add audit logging

3. **Security Hardening**
   - Enable Proxmox API SSL verification
   - Implement 2FA (future enhancement)
   - Add session management
   - Set up monitoring and alerting

4. **Build and Deploy**
   ```bash
   npm run build
   npm start
   ```

## Future Enhancements

- 🔐 Two-factor authentication (2FA)
- 📧 Email notifications for VM events
- 📈 Historical usage analytics
- 🔄 Automated VM scheduling
- 💳 Payment integration
- 📱 Mobile app
- 🌐 Multi-language support
- 📊 Advanced monitoring dashboards

## Troubleshooting

### Common Issues

1. **Proxmox Connection Failed**
   - Verify Proxmox host URL and credentials
   - Check network connectivity
   - Ensure Proxmox API is enabled

2. **VM Not Found**
   - Verify VM IDs in user configuration
   - Check VM exists on specified Proxmox node
   - Ensure user has permission to access VM

3. **Authentication Issues**
   - Check JWT secret configuration
   - Verify user credentials
   - Clear browser localStorage if needed

### Logs

- Backend logs: Check console output when running `npm run server:dev`
- Frontend logs: Open browser developer tools console
- Proxmox logs: Check Proxmox VE system logs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review Proxmox VE documentation for API details 