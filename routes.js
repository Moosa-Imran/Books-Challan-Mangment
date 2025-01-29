const express = require('express');
const path = require('path');
const { ObjectId } = require('mongodb');
const nodemailer = require('nodemailer');;
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
router.post('/payments/create', async (req, res) => {
    const { cnic, amount, dueDate, paymentType, books, quantities } = req.body;
    console.log(req.body);
    const managmentDb = req.app.locals.managmentDb;

    try {
        const user = await managmentDb.collection('Customers').findOne({ cnic });
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'No user found with the provided CNIC.',
            });
        }

        let totalAmount = 0;
        if (paymentType === 'manual') {
            totalAmount = parseFloat(amount);
        } else {
            for (const bookId of books) {
                const book = await managmentDb.collection('Books').findOne({ _id: new ObjectId(bookId) });
                if (!book) {
                    return res.status(404).json({
                        status: 'error',
                        message: `Book with ID ${bookId} not found.`,
                    });
                }
                totalAmount += book.price * quantities[bookId]; // Assuming each book has a price

                // Subtract the quantity from the book stock
                await managmentDb.collection('Books').updateOne(
                    { _id: new ObjectId(bookId) },
                    { $inc: { quantity: -quantities[bookId] } }
                );
            }
        }

        const challanNo = Math.floor(10000000 + Math.random() * 900000000);
        const challanData = {
            challanNo,
            cnic,
            fullName: user.fullName,
            schoolName: user.schoolName,
            amount: totalAmount,
            dueDate: new Date(dueDate),
            createdAt: new Date(),
            status: 'unpaid',
            paymentType,
            books,
            quantities
        };

        await managmentDb.collection('Challans').insertOne(challanData);

        res.status(200).json({
            status: 'success',
            message: 'Challan created successfully.',
            paymentId: challanNo
        });
    } catch (error) {
        console.error('Error creating challan:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error.' });
    }
});

  
// Route to fetch the list of books
router.get('/fetchBooks', async (req, res) => {
    const managmentDb = req.app.locals.managmentDb;
    try {
        const books = await managmentDb.collection('Books').find().toArray();
        res.status(200).json({
            status: 'success',
            books: books,
        });
    } catch (error) {
        console.error('Error fetching books:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch books.',
        });
    }
});

// POST Route: Handle form submission to add a new book
router.post('/books/add', isAuthenticated, async (req, res) => {
    const managementDb = req.app.locals.managmentDb; // Get the database reference

    const { title, grade, isbn, price, category, quantity } = req.body;

    try {
        // Check if the ISBN already exists
        const existingBook = await managementDb.collection('Books').findOne({ isbn });
        if (existingBook) {
            return res.status(400).json({ status: 'error', message: 'ISBN already exists.' });
        }

        // Insert the book into the database
        await managementDb.collection('Books').insertOne({
            title,
            grade,
            isbn,
            price: parseFloat(price), // Convert price to a number
            category,
            quantity: parseInt(quantity), // Convert quantity to an integer
            createdAt: new Date() // Add a timestamp
        });

        // Send success response
        res.status(200).json({ status: 'success', message: 'Book added successfully!' });
    } catch (error) {
        console.error('Error adding book:', error);
        // Send error response
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});

// DELETE Route: Handle deleting a book
router.delete('/books/delete/:id', isAuthenticated, async (req, res) => {
    const managementDb = req.app.locals.managmentDb; // Get the database reference
    const { id } = req.params;

    try {
        // Delete the book by its ID
        await managementDb.collection('Books').deleteOne({ _id: new ObjectId(id) });

        res.json({ success: true, message: 'Book deleted successfully' });
    } catch (error) {
        console.error('Error deleting book:', error);
        res.status(500).send('Internal server error');
    }
});

// POST Route: Update a book
router.post('/books/edit/:id', isAuthenticated, async (req, res) => {
    const managementDb = req.app.locals.managmentDb;
    const { id } = req.params;
    const { title, grade, isbn, price, category, quantity } = req.body;

    try {
        // Update the book in the database
        await managementDb.collection('Books').updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    title,
                    grade,
                    isbn,
                    price: parseFloat(price),
                    category,
                    quantity: parseInt(quantity),
                    updatedAt: new Date(),
                },
            }
        );

        // Send success response
        res.status(200).json({ status: 'success', message: 'Book updated successfully!' });
    } catch (error) {
        console.error('Error updating book:', error);
        res.status(500).send('Internal server error');
    }
});


// Login Route
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const managmentDb = req.app.locals.managmentDb;
    try {
        // Search for the user by username or email
        const user = await managmentDb.collection('Admins').findOne({ username: username });

        // If user is not found
        if (!user) {
            return res.status(401).json({ status: 'invalid', message: 'Invalid username.' });
        }

        if (user.password !== password) {
            return res.status(401).json({ status: 'incorrect', message: 'Incorrect password.' });
        }

        // If valid, store user session and create cookie
        req.session.user = {
            id: user._id,
            username: user.username,
        };

        // Send success response
        res.status(200).json({ status: 'success', message: 'Login successful!' });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
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

// Dashboard Route
router.get('/dashboard', isAuthenticated, async (req, res) => {
    const managmentDb = req.app.locals.managmentDb;
    try {
        // Fetch total number of customers
        const totalCustomers = await managmentDb.collection('Customers').countDocuments();
        // Fetch total number of books
        const totalBooks = await managmentDb.collection('Books').countDocuments();
        // Fetch total number of challans
        const totalChallans = await managmentDb.collection('Challans').countDocuments();
        // Fetch total fees collected
        const totalFeesCollectedResult = await managmentDb.collection('Challans').aggregate([
            {
                $match: { status: 'paid' }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' }
                }
            }
        ]).toArray();

        const totalFeesCollected = totalFeesCollectedResult.length > 0 ? totalFeesCollectedResult[0].total : 0;
        // Fetch pending fees
        const pendingFeesResult = await managmentDb.collection('Challans').aggregate([
            {
                $match: { status: 'unpaid' }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' }
                }
            }
        ]).toArray();
        const pendingFees = pendingFeesResult.length > 0 ? pendingFeesResult[0].total : 0;
        // Render dashboard page with the data
        res.render('dashboard', {
            totalCustomers,
            totalBooks,
            totalChallans,
            totalFeesCollected,
            pendingFees
        });
    } catch (err) {
        console.error("Error loading dashboard:", err);
        res.status(500).send("Server error");
    }
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
        // Find the challan by challanNo
        const challanNo = Number(id);
        const challan = await managmentDb.collection('Challans').findOne({ challanNo });

        if (!challan) {
            return res.status(404).send('Challan not found');
        }

        let totalAmount = challan.amount; // Default to challan amount (for manual payments)
        let bookDetails = [];

        if (challan.paymentType === 'create' && challan.books.length > 0) {
            const bookIds = challan.books.map(id => new ObjectId(id));

            // Fetch book details
            const books = await managmentDb.collection('Books').find({ _id: { $in: bookIds } }).toArray();

            // Calculate total amount and prepare book details
            totalAmount = 0;
            bookDetails = books.map(book => {
                const quantity = challan.quantities[book._id.toString()] || 0;
                const price = book.price || 0;
                const subtotal = quantity * price;
                totalAmount += subtotal;

                return {
                    title: book.title,
                    quantity,
                    price,
                    subtotal
                };
            });
        }

        // Render the view
        res.render('view-challan', { challan, bookDetails, totalAmount });
    } catch (error) {
        console.error('Error fetching challan:', error);
        res.status(500).send('Internal server error');
    }
});

router.get('/payments/pending', isAuthenticated, async (req, res) => {
    const managmentDb = req.app.locals.managmentDb;

    try {
        const pendingChallans = await managmentDb.collection('Challans').find({ status: 'unpaid' }).toArray();

        res.render('pending-challans', { challans: pendingChallans });
    } catch (error) {
        console.error('Error fetching pending challans:', error);
        res.status(500).send('Internal server error');
    }
});

router.get('/payments/accepted', isAuthenticated, async (req, res) => {
    const managmentDb = req.app.locals.managmentDb;

    try {
        const acceptedChallans = await managmentDb.collection('Challans').find({ status: 'paid' }).toArray();

        res.render('accepted-challans', { challans: acceptedChallans });
    } catch (error) {
        console.error('Error fetching accepted challans:', error);
        res.status(500).send('Internal server error');
    }
});

// GET Route: Display the Add Book page
router.get('/books/add', isAuthenticated, (req, res) => {
    // Render the add-book page with default empty values and the `editing` flag set to false
    res.render('add-book', { book: {}, editing: false });
});

// GET Route: Display all books
router.get('/books', isAuthenticated, async (req, res) => {
    const managementDb = req.app.locals.managmentDb; // Get the database reference

    try {
        // Fetch all books from the database
        const books = await managementDb.collection('Books').find().toArray();

        // Render the books page with the retrieved data
        res.render('books', { books });
    } catch (error) {
        console.error('Error fetching books:', error);
        res.status(500).send('Internal server error');
    }
});

// GET Route: Edit a book (renders the edit form with pre-filled values)
router.get('/books/edit/:id', isAuthenticated, async (req, res) => {
    const managementDb = req.app.locals.managmentDb;
    const { id } = req.params;

    try {
        // Find the book by its ID
        const book = await managementDb.collection('Books').findOne({ _id: new ObjectId(id) });

        if (!book) {
            return res.status(404).send('Book not found');
        }

        // Render the add-book page with pre-filled data and a flag for editing
        res.render('add-book', { book, editing: true });
    } catch (error) {
        console.error('Error fetching book for editing:', error);
        res.status(500).send('Internal server error');
    }
});




module.exports = router;