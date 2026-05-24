// TODO: 连接数据库
import mongoose from 'mongoose'

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/scene-prod'

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGODB_URL)
    console.log(`Connected to MongoDB: ${conn.connection.host}`)
    return conn
  } catch (error) {
    console.error('Error connecting to MongoDB:', error as Error)
    process.exit(1)
  }
}

export default connectDB