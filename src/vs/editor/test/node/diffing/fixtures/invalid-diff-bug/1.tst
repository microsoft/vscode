const API = require('../src/api');

describe('API', () => {
  let api;
  let database;

  beforeAll(() => {
    database = {
      getAllBooks: jest.fn(),
      getBooksByAuthor: jest.fn(),
      getBooksByTitle: jest.fn(),
    };
    api = new API(database);
  });

  describe('GET /books', () => {
    it('should return all books', async () => {
      const mockBooks = [{ title: 'Book 1' }, { title: 'Book 2' }];
      database.getAllBooks.mockResolvedValue(mockBooks);

      const req = {};
      const res = {
        json: jest.fn(),
      };

      await api.register({
        get: (path, handler) => {
          if (path === '/books') {
            handler(req, res);
          }
        },
      });

      expect(database.getAllBooks).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockBooks);
    });
  });

  describe('GET /books/author/:author', () => {
    it('should return books by author', async () => {
      const mockAuthor = 'John Doe';
      const mockBooks = [{ title: 'Book 1', author: mockAuthor }, { title: 'Book 2', author: mockAuthor }];
      database.getBooksByAuthor.mockResolvedValue(mockBooks);

      const req = {
        params: {
          author: mockAuthor,
        },
      };
      const res = {
        json: jest.fn(),
      };

      await api.register({
        get: (path, handler) => {
          if (path === `/books/author/${mockAuthor}`) {
            handler(req, res);
          }
        },
      });

      expect(database.getBooksByAuthor).toHaveBeenCalledWith(mockAuthor);
      expect(res.json).toHaveBeenCalledWith(mockBooks);
    });
  });

  describe('GET /books/title/:title', () => {
    it('should return books by title', async () => {
      const mockTitle = 'Book 1';
      const mockBooks = [{ title: mockTitle, author: 'John Doe' }];
      database.getBooksByTitle.mockResolvedValue(mockBooks);

      const req = {
        params: {
          title: mockTitle,
        },
      };
      const res = {
        json: jest.fn(),
      };

      await api.register({
        get: (path, handler) => {
          if (path === `/books/title/${mockTitle}`) {
            handler(req, res);
          }
        },
      });

      expect(database.getBooksByTitle).toHaveBeenCalledWith(mockTitle);
      expect(res.json).toHaveBeenCalledWith(mockBooks);
    });
  });
});
