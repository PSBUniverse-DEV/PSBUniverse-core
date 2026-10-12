const dealerPortalModule = {
  key: "dealer-portal",
  module_key: "psbuniverse",
  name: "Dealer Portal",
  description: "Sign-in and account pages for dealers.",
  icon: "store",
  group_name: "Dealer Portal",
  group_desc: "Pages used by dealers, outside the internal workspace.",
  order: 900,
  public: true,
  routes: [
    { path: "/dealer/login", page: "DealerLoginPage", auth: false },
    { path: "/dealer/account", page: "DealerAccountPage", auth: false },
  ],
};

export default dealerPortalModule;
