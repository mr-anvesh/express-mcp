import express from 'express';
const app = express();
// Middleware
app.use(express.json());
// Routes
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the API' });
});
app.get('/users', (req, res) => {
    res.json([
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' },
    ]);
});
app.get('/users/:id', (req, res) => {
    const userId = req.params.id;
    res.json({
        id: userId,
        name: 'Alice',
        email: 'alice@example.com',
    });
});
app.post('/users', (req, res) => {
    const newUser = {
        id: 3,
        ...req.body,
    };
    res.status(201).json(newUser);
});
app.put('/users/:id', (req, res) => {
    const userId = req.params.id;
    res.json({
        id: userId,
        ...req.body,
    });
});
app.delete('/users/:id', (req, res) => {
    const userId = req.params.id;
    res.json({
        message: `User ${userId} deleted`,
    });
});
// Nested router example
const apiRouter = express.Router();
apiRouter.get('/posts', (req, res) => {
    res.json([
        { id: 1, title: 'First Post', author: 'Alice' },
        { id: 2, title: 'Second Post', author: 'Bob' },
    ]);
});
apiRouter.get('/posts/:id', (req, res) => {
    res.json({
        id: req.params.id,
        title: 'Sample Post',
        content: 'This is a sample post',
    });
});
app.use('/api', apiRouter);
// Export app (don't start the server here)
export default app;
//# sourceMappingURL=app.js.map