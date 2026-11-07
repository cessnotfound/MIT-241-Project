SAS Portal – Student Affairs and Services
A web-based Student Affairs and Services (SAS) Portal for Mariano Marcos State University (MMSU). The system supports student organizations in submitting and managing their requirements, while the Office of Student Affairs and Services (OSAS) can review submissions and manage organization records.
Features

Organization Portal
- Organization account access and organization profile management.
- Accomplishment Report (AR) submission and management.
- Activity, participation, award, and tangible project records.
- Financial Statement (FS) submission and management.
- Document registration, tracking, and file management.
- Renewal application submission and supporting forms.
- 
OSAS Portal
- Review and manage organization information.
- Review submitted Accomplishment Reports.
- Review submitted Financial Statements.
- Manage and track organization documents.
- Review organization renewal applications.
- Access administrative workflows for student organization services.
- 
Technologies Used
- React
- TypeScript
- Vite
- Node.js
- Express.js
- Supabase
- PostgreSQL
System Setup
Requirements
- Node.js
- npm
- Supabase project and database
  
1. Clone the repository
git clone https://github.com/cessnotfound/MIT-241-Project.git
cd MIT-241-Project
2. Install dependencies
npm install
3. Configure the application
Create the required local environment configuration for the backend and provide the Supabase database and storage connection settings used by the project.
4. Run the system
npm run dev
Open the frontend in your browser:
http://localhost:5173
The backend runs on:
http://localhost:3001
Available Scripts
Command	Description
npm install	Install project dependencies
npm run dev	Run the frontend and backend development servers
npm run dev:client	Run the frontend development server
npm run dev:server	Run the backend development server
npm run build	Build the frontend for production
npm run lint	Run code linting
npm run preview	Preview the production build


Project Structure
MIT-241-Project/
├── server/                 # Express backend and API routes
├── src/
│   ├── components/         # Reusable React components
│   ├── pages/              # Organization and OSAS pages
│   ├── styles/             # Application styles
│   ├── App.tsx             # Main application component
│   └── main.tsx            # Frontend entry point
├── public/                 # Static assets
├── package.json
├── tsconfig.json
└── vite.config.ts

Database
The system uses Supabase PostgreSQL for application data and Supabase Storage for uploaded files. The backend communicates with the database and storage services through the application's server-side API.
Project
Repository: https://github.com/cessnotfound/MIT-241-Project

Institution: Mariano Marcos State University (MMSU)
