export const auth = async () => {
  return {
    user: {
      id: 'user_0',
      name: 'John Doe',
      email: 'john@example.com',
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
  };
};
