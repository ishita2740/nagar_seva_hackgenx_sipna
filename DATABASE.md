# Database Setup & Management

## What Was Fixed

### Problem
- Category dropdown was showing **repeated/duplicate values** 
- When the server restarted, data was being loaded again
- The database was creating duplicate entries on each restart

### Root Cause
1. The `grievance_categories` table didn't have a UNIQUE constraint on the `name` column
2. The `INSERT OR IGNORE` command couldn't prevent duplicates since there was no unique constraint to conflict with
3. Categories were being re-inserted every time the schema ran on server startup

### Solution
1. ✅ Added `UNIQUE` constraint to the `name` column in `grievance_categories` table
2. ✅ Created a `reset-db.js` script to clean up existing duplicates
3. ✅ Database file persists in `data/grievance.db` and survives server restarts

---

## Database Details

### Database Type
- **SQLite** via sql.js (JavaScript implementation)
- File-based storage: `data/grievance.db`
- Persists across server restarts
- Suitable for small to medium deployments

### Database Schema

#### Users Table
- Stores citizen and authority user accounts
- Email has UNIQUE constraint (prevents duplicate registrations)
- Password is bcrypt-hashed

#### Grievance Categories (Fixed)
- Stores the 9 predefined categories (now with UNIQUE constraint on name)
- Contains: id, name, description, department
- Examples: "Potholes & Roads", "Street Lights", "Waste Management", etc.

#### Grievances Table  
- Stores citizen complaint submissions
- Links to users (citizen) and categories
- Tracks status, priority, assigned authority
- Stores location (address, latitude, longitude)
- Supports images and resolution notes

#### Grievance Comments Table
- Tracks discussions and updates on grievances
- Links grievances to users

---

## Managing the Database

### Fresh Start / Reset Database
To completely reset the database and remove duplicates:

```bash
npm run reset-db
```

This will:
1. Delete the old `data/grievance.db` file
2. Recreate it with proper schema and UNIQUE constraints
3. Load all 9 default categories (no duplicates)
4. Create the admin user

### Start Server
```bash
npm start
```

The server will:
1. Auto-initialize the database if it doesn't exist
2. Load the existing database if it already exists
3. Listen on http://localhost:3000

### View Database File
Database file location: `data/grievance.db`

### Admin Credentials
- Email: `admin@government.gov`
- Password: `admin123`

---

## Data Persistence

✅ **Data is persisted** - Once you create grievances, citizens, and test data, they will survive server restarts.

### How It Works
1. Database is stored in file: `data/grievance.db`
2. On server start, if file exists → load existing data
3. If file doesn't exist → create new database with schema
4. Every write operation saves to disk automatically

### Why Categories Won't Duplicate Anymore
- Added `UNIQUE` constraint on category name
- `INSERT OR IGNORE` now works correctly - if a category name already exists, it's ignored
- Only 9 categories persist in the database (the default ones)

---

## Troubleshooting

### Q: I still see duplicate categories in the dropdown
**A:** You haven't deleted the old database file. Run:
```bash
npm run reset-db
```

### Q: Database file doesn't exist after creating it
**A:** Make sure the `data/` directory exists:
```bash
mkdir data
npm run reset-db
```

### Q: Want to keep existing grievances but remove duplicate categories?
**You can't easily do this with SQLite.** Best approach:
1. Export your data (grievances, users) 
2. Run `npm run reset-db` to start fresh
3. Manually re-add users and grievances if needed

---

## Future Improvements

For production deployment, consider:
- Switch from sql.js to a proper database (PostgreSQL, MySQL)
- Implement data backup system
- Add database migration scripts
- Use connection pooling
- Implement transaction logging
