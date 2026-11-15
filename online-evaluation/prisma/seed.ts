import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('123456789', 10);

  const users = [
    { name: 'Admin User', email: 'admin@gmail.com', role: 'ADMIN' },
    { name: 'Teacher User', email: 'teacher@gmail.com', role: 'TEACHER' },
    { name: 'Student User', email: 'student@gmail.com', role: 'STUDENT' },
  ];

  for (const u of users) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      await prisma.user.update({
        where: { email: u.email },
        data: {
          password: hashedPassword,
          role: u.role,
          name: u.name,
        },
      });
      console.log(`Updated user: ${u.email} (${u.role})`);
    } else {
      await prisma.user.create({
        data: {
          name: u.name,
          email: u.email,
          password: hashedPassword,
          role: u.role,
        },
      });
      console.log(`Created user: ${u.email} (${u.role})`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
