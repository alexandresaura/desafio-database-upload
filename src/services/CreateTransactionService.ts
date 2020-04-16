import { getRepository, getCustomRepository } from 'typeorm';

import AppError from '../errors/AppError';

import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';

import Category from '../models/Category';

interface Request {
  title: string;
  value: number;
  type: 'income' | 'outcome';
  category: string;
}

class CreateTransactionService {
  public async execute({
    title,
    value,
    type,
    category,
  }: Request): Promise<Transaction> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);

    if (type === 'outcome') {
      const balance = await transactionsRepository.getBalance();
      if (balance.total - value < 0) {
        throw new AppError('The balance should not be negative');
      }
    }

    const categoriesRespository = getRepository(Category);

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

    const newTransaction = transactionsRepository.create({
      title,
      value,
      type,
      category_id,
    });

    await transactionsRepository.save(newTransaction);

    return newTransaction;
  }
}

export default CreateTransactionService;
