const mongoose = require('mongoose');
const User = require('./models/User');
const Progress = require('./models/Progress');
const Lesson = require('./models/Lesson');
require('dotenv').config();

const sampleUsers = [
  {
    username: 'maria_garcia',
    email: 'maria@example.com',
    password: 'password123',
    firstName: 'María',
    lastName: 'García',
    nativeLanguage: 'en',
    targetLanguages: [{ language: 'es', level: 'intermediate' }],
    totalXP: 2450,
    currentStreak: 15,
    longestStreak: 28,
    level: 3,
    badges: [
      { name: 'First Steps', description: 'Completed first lesson', icon: '🎯' },
      { name: 'Streak Master', description: '7-day streak achieved', icon: '🔥' },
      { name: 'Grammar Guru', description: 'Mastered 10 grammar lessons', icon: '📚' }
    ]
  },
  {
    username: 'john_smith',
    email: 'john@example.com',
    password: 'password123',
    firstName: 'John',
    lastName: 'Smith',
    nativeLanguage: 'en',
    targetLanguages: [{ language: 'es', level: 'beginner' }],
    totalXP: 890,
    currentStreak: 5,
    longestStreak: 12,
    level: 1,
    badges: [
      { name: 'First Steps', description: 'Completed first lesson', icon: '🎯' }
    ]
  },
  {
    username: 'sophie_martin',
    email: 'sophie@example.com',
    password: 'password123',
    firstName: 'Sophie',
    lastName: 'Martin',
    nativeLanguage: 'fr',
    targetLanguages: [{ language: 'es', level: 'advanced' }],
    totalXP: 5670,
    currentStreak: 42,
    longestStreak: 42,
    level: 6,
    badges: [
      { name: 'First Steps', description: 'Completed first lesson', icon: '🎯' },
      { name: 'Streak Master', description: '7-day streak achieved', icon: '🔥' },
      { name: 'Grammar Guru', description: 'Mastered 10 grammar lessons', icon: '📚' },
      { name: 'Conversation King', description: 'Completed 50 conversations', icon: '💬' },
      { name: 'Dedication', description: '30-day streak achieved', icon: '⭐' }
    ]
  },
  {
    username: 'alex_chen',
    email: 'alex@example.com',
    password: 'password123',
    firstName: 'Alex',
    lastName: 'Chen',
    nativeLanguage: 'zh',
    targetLanguages: [{ language: 'es', level: 'intermediate' }],
    totalXP: 3200,
    currentStreak: 8,
    longestStreak: 25,
    level: 4,
    badges: [
      { name: 'First Steps', description: 'Completed first lesson', icon: '🎯' },
      { name: 'Streak Master', description: '7-day streak achieved', icon: '🔥' },
      { name: 'Grammar Guru', description: 'Mastered 10 grammar lessons', icon: '📚' }
    ]
  },
  {
    username: 'demo_user',
    email: 'demo@linguaai.com',
    password: 'demo123',
    firstName: 'Demo',
    lastName: 'User',
    nativeLanguage: 'en',
    targetLanguages: [{ language: 'es', level: 'beginner' }],
    totalXP: 150,
    currentStreak: 2,
    longestStreak: 3,
    level: 1,
    badges: [
      { name: 'First Steps', description: 'Completed first lesson', icon: '🎯' }
    ]
  }
];

async function seedUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get existing lessons
    const lessons = await Lesson.find({ language: 'es' }).limit(3);
    console.log(`Found ${lessons.length} lessons`);

    // Clear existing non-admin users
    await User.deleteMany({ role: { $ne: 'admin' } });
    await Progress.deleteMany({});
    console.log('Cleared existing users and progress');

    // Insert sample users
    const insertedUsers = await User.insertMany(sampleUsers);
    console.log(`Inserted ${insertedUsers.length} users`);

    // Create progress records for users
    for (let i = 0; i < insertedUsers.length; i++) {
      const user = insertedUsers[i];
      const lessonProgress = [];
      
      // Add progress for first few lessons based on user level
      const numLessons = Math.min(lessons.length, user.level + 1);
      for (let j = 0; j < numLessons; j++) {
        lessonProgress.push({
          lessonId: lessons[j]._id,
          status: j < numLessons - 1 ? 'completed' : 'in_progress',
          score: 70 + Math.floor(Math.random() * 30),
          attempts: 1 + Math.floor(Math.random() * 2),
          timeSpent: 300 + Math.floor(Math.random() * 600),
          completedAt: j < numLessons - 1 ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) : null
        });
      }

      const progress = new Progress({
        userId: user._id,
        language: 'es',
        lessonProgress,
        vocabularyProgress: [],
        streakData: {
          currentStreak: user.currentStreak,
          longestStreak: user.longestStreak,
          lastActiveDate: new Date()
        },
        weeklyGoal: {
          targetXP: 500,
          currentXP: Math.floor(Math.random() * 500)
        }
      });
      await progress.save();
    }

    console.log('User seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding users:', error);
    process.exit(1);
  }
}

seedUsers();
