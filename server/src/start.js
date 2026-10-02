import mongoose from 'mongoose';
import app from './index.js';

const port = Number(process.env.PORT || 4000);

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fieldstock');
app.listen(port, () => console.info(`Fieldstock API listening on ${port}`));