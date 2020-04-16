import { getRepository, getCustomRepository } from 'typeorm';

import fs from 'fs';
import path from 'path';
import uploadConfig from '../config/upload';

import AppError from '../errors/AppError';

import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';

import Category from '../models/Category';

interface Request {
  filename: string;
}

interface TransactionCSV {
  [key: string]: string;
}

class ImportTransactionsService {
  async execute({ filename }: Request): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);

    const filepath = path.join(uploadConfig.directory, filename);

    const data = fs.readFileSync(filepath, 'UTF-8');
    await fs.promises.unlink(filepath);

    const lines = data.split(/\r?\n/);

    const props: string[] = [];
    const transactionsCSV: TransactionCSV[] = [];

    lines.forEach((line, index) => {
      if (line) {
        if (!index) {
          line.split(',').forEach(prop => props.push(prop.trim()));
        } else {
          const transactionCSV: TransactionCSV = {};

          line.split(',').forEach((value, valueIndex) => {
            transactionCSV[props[valueIndex]] = value.trim();
          });

          transactionsCSV.push(transactionCSV);
        }
      }
    });

    const income = transactionsCSV
      .filter(transactionCSV => transactionCSV.type === 'income')
      .reduce(
        (total, transactionCSV) => total + Number(transactionCSV.value),
        0,
      );

    const outcome = transactionsCSV
      .filter(transactionCSV => transactionCSV.type === 'outcome')
      .reduce(
        (total, transactionCSV) => total + Number(transactionCSV.value),
        0,
      );

    const totalCSV = income - outcome;

    if (totalCSV < 0) {
      const balance = await transactionsRepository.getBalance();
      if (balance.total - totalCSV < 0) {
        throw new AppError('The balance should not be negative');
      }
    }

    const categories = Array.from(
      new Set(transactionsCSV.map(transactionCSV => transactionCSV.category)),
    );

    const transactions: {
      title: string;
      value: number;
      type: 'income' | 'outcome';
      category_id: string;
    }[] = [];

    const categoriesRespository = getRepository(Category);
    await Promise.all(
      categories.map(async category => {
        const findCategoryByTitle = await categoriesRespository.findOne({
          where: {
            title: category,
          },
        });

        let category_id: string;
        if (!findCategoryByTitle) {
          const newCategory = categoriesRespository.create({
            title: category,
          });

          await categoriesRespository.save(newCategory);

          category_id = newCategory.id;
        } else {
          category_id = findCategoryByTitle.id;
        }

        transactionsCSV.forEach(transactionCSV => {
          if (transactionCSV.category === category) {
            transactions.push({
              title: transactionCSV.title,
              value: Number(transactionCSV.value),
              type: transactionCSV.type as 'income' | 'outcome',
              category_id,
            });
          }
        });
      }),
    );

    const newTransactions = await Promise.all(
      transactions.map(async transaction => {
        const { title, value, type, category_id } = transaction;

        const newTransaction = transactionsRepository.create({
          title,
          value,
          type,
          category_id,
        });

        await transactionsRepository.save(newTransaction);

        return newTransaction;
      }),
    );

    return newTransactions;
  }
}

export default ImportTransactionsService;
