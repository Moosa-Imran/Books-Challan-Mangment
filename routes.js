const express = require('express');
const path = require('path');
const { ObjectId } = require('mongodb'); 
const nodemailer = require('nodemailer');;
const { v4: uuidv4 } = require("uuid");
const router = express.Router();
const emailTemplates = require('./emailTemplates');
const dotenv = require('dotenv');

dotenv.config(); 


// Protected Route Middleware
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    } else {
        return res.redirect('/');
    }
}

// Create a transporter using Namecheap SMTP settings
const transporter = nodemailer.createTransport({
    host: "smtp.privateemail.com",
    port: 587, 
    secure: false, // Set to true if using port 465
    auth: {
        user: process.env.EMAIL, // Email from your .env file
        pass: process.env.PASSWORD // Password from your .env file
    }
});

// Route for Fetching User's Detials
router.get('/fetchUser', async (req, res) => {
    // Get the user ID from the session
    const userId = req.session.user ? req.session.user.id : null;
    const managmentDb = req.app.locals.managmentDb;

    try {
        // Check if the user ID exists
        if (!userId) {
            return res.status(401).json({ status: false, message: 'User not authenticated.' });
        }

        // Search for the user in the Customers collection
        const user = await managmentDb.collection('Admins').findOne({ _id: new ObjectId(userId) });
        if (user) {
            // If user is found, send the user data along with status
            res.status(200).json({ status: true, user });
        } else {
            // If user does not exist, send status false
            res.status(404).json({ status: false, message: 'User not found.' });
        }
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ status: false, message: 'Internal server error' });
    }
});

// Add User Route
router.post('/users/add', async (req, res) => {
    const { fullName, schoolName, person, phoneNumber, email, cnic, address } = req.body;
    const managmentDb = req.app.locals.managmentDb;

    try {
        // Check if the email, phone number, or CNIC already exists
        const existingUser = await managmentDb.collection('Customers').findOne({
            $or: [
                { email: email },
                { phoneNumber: phoneNumber },
                { cnic: cnic }
            ]
        });

        if (existingUser) {
            return res.status(400).json({ status: 'error', message: 'Email, phone number, or CNIC already exists.' });
        }

        // Insert new user into the database
        const newUser = {
            fullName,
            schoolName,
            person,
            phoneNumber,
            email,
            cnic,
            address,
        };

        await managmentDb.collection('Customers').insertOne(newUser);

        // Send success response
        res.status(200).json({ status: 'success', message: 'User added successfully!' });
    } catch (error) {
        // Log the error for debugging
        console.error('Error adding user:', error);

        // Send error response
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});

// Delete User Route
router.delete('/users/delete/:id', async (req, res) => {
    const userId = req.params.id;
    const managmentDb = req.app.locals.managmentDb;

    try {
        // Delete the user from the database
        await managmentDb.collection('Customers').deleteOne({ _id: new ObjectId(userId) });

        // Send success response
        res.status(200).json({ status: 'success', message: 'User deleted successfully!' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});

// Create Challan Route
router.post('/challans/create', async (req, res) => {
    const { cnic, amount, dueDate } = req.body;
    const managmentDb = req.app.locals.managmentDb; // Access the database

    try {
        // Step 1: Check if the user exists in the Customers collection by CNIC
        const user = await managmentDb.collection('Customers').findOne({ cnic });
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'No user found with the provided CNIC.',
            });
        }

        // Step 2: Generate a unique Challan No using uuid
        const { v4: uuidv4 } = require('uuid');
        const challanNo = uuidv4();

        // Step 3: Create a new challan object
        const challanData = {
            challanNo,
            cnic,
            fullName: user.fullName, // User's full name from the database
            schoolName: user.schoolName, // User's school name from the database
            amount: parseFloat(amount), // Convert amount to a number
            dueDate: new Date(dueDate), // Ensure dueDate is stored as a Date object
            createdAt: new Date(), // Timestamp for when the challan is created
            status: 'unpaid', // Default status for new challans
        };

        // Step 4: Insert the new challan into the Challans collection
        await managmentDb.collection('Challans').insertOne(challanData);

        // Step 5: Respond with success and the generated Challan No
        return res.status(200).json({
            status: 'success',
            message: 'Challan created successfully.',
            challanNo,
        });
    } catch (error) {
        console.error('Error creating challan:', error);

        // Handle server errors
        return res.status(500).json({
            status: 'error',
            message: 'Internal server error. Please try again later.',
        });
    }
});


// Login Route
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const managmentDb = req.app.locals.managmentDb;
    try {
        // Search for the user by username or email
        const user = await managmentDb.collection('Admins').findOne({username: username});

        // If user is not found
        if (!user) {
            return res.status(401).json({status: 'invalid', message: 'Invalid username.' });
        }

        if (user.password !== password) {
            return res.status(401).json({status: 'incorrect', message: 'Incorrect password.' });
        }

        // If valid, store user session and create cookie
        req.session.user = {
            id: user._id,
            username: user.username,
        };

        // Send success response
        res.status(200).json({status: 'success', message: 'Login successful!' });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({status: 'error',  message: 'Internal server error' });
    }
});

// Route for Logout
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: 'Logout failed. Please try again later.' });
        }
        res.clearCookie('connect.sid'); 
        res.status(200).json({ message: 'Logout successful!' });
    });
});



// Routes for rendering EJS pages

router.get('/dashboard', isAuthenticated, (req, res) => {
    const mockData = {
        totalPayments: 5000,
        pendingPayments: 1500,
        paidAmount: 3500,
        totalUsers: 100,
        activeUsers: 85,
        deactivatedUsers: 15,
    };

    res.render('dashboard', mockData);
});

router.get('/users', isAuthenticated, async (req, res) => {
    const managmentDb = req.app.locals.managmentDb; 

    try {
        // Fetch all users from the database
        const users = await managmentDb.collection('Customers').find().toArray();

        // Render the users page with the fetched data
        res.render('users', { users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});

router.get('/users/add', isAuthenticated, (req, res) => {
    res.render('add-user');
});

router.get('/payments/create', isAuthenticated, (req, res) => {
    res.render('create-payment'); 
});

router.get('/challan/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const managmentDb = req.app.locals.managmentDb;

    try {
        // Find the challan by ID
        const challan = await managmentDb.collection('Challans').findOne({ challanNo: id });

        if (!challan) {
            return res.status(404).send('Challan not found');
        }

        // Render the view-challan.ejs template with the challan data
        res.render('view-challan', { challan });
    } catch (error) {
        console.error('Error fetching challan:', error);
        res.status(500).send('Internal server error');
    }
});




module.exports = router;